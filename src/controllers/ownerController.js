// backend/src/controllers/ownerController.js
// Purpose: Owner-related controller handlers (signup, login, profile, vehicles)
// - Accepts both JSON and multipart/form-data (req.file handled by multer middleware if present)
// - Returns token + user on successful signup/login for frontend auto-login
// - Uses bcrypt for password hashing and jsonwebtoken for JWTs
// - Assumes `pool` exported from src/db/connection (mysql2)

const bcrypt = require('bcrypt'); // for hashing passwords
const jwt = require('jsonwebtoken'); // for JWT tokens
const { pool } = require('../db/connection'); // mysql2 pool
const fs = require('fs'); // file operations (cleanup)
const path = require('path'); // path helpers

// Load JWT config from environment or use dev defaults
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Helper: sign a JWT containing minimal user data (id, email, role)
function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'owner' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Helper: hash plain text password
async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// Helper: compare plain password with hashed
async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function resetPassword(req, res) {
  try {
    const { email, dob, newPassword } = req.body || {};

    if (!email || !dob || !newPassword) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'email, dob and newPassword are required',
      });
    }

    const [rows] = await pool.query(
      'SELECT id FROM owners WHERE LOWER(email) = LOWER(?) AND DATE(dob) = DATE(?) LIMIT 1',
      [email, dob]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Email and DOB do not match any owner account',
      });
    }

    const hashed = await hashPassword(newPassword);
    await pool.query(
      'UPDATE owners SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashed, rows[0].id]
    );

    return res.json({ message: 'password_updated' });
  } catch (err) {
    console.error('owner resetPassword error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

/**
 * Owner signup
 * - Accepts name, email, password required
 * - Optional: phone, dob, gender
 * - Optional uploaded profile picture via multer (req.file)
 * - Ensures email/phone uniqueness, stores hashed password, returns { token, user } on success
 */
async function signup(req, res) {
  try {
    // Pull fields from request body (works for JSON and multipart/form-data)
    const { name, email, password, phone, dob, gender, city } = req.body || {};

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'missing_required_fields', message: 'name, email and password are required' });
    }

    // Check if email already used (case-insensitive)
    const [existsByEmail] = await pool.query('SELECT id FROM owners WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
    if (existsByEmail && existsByEmail.length > 0) {
      return res.status(409).json({ error: 'email_exists', message: 'An account with this email already exists' });
    }

    // If phone provided, ensure uniqueness
    if (phone) {
      const [existsByPhone] = await pool.query('SELECT id FROM owners WHERE phone = ? LIMIT 1', [phone]);
      if (existsByPhone && existsByPhone.length > 0) {
        return res.status(409).json({ error: 'phone_exists', message: 'An account with this phone already exists' });
      }
    }

    // Handle optional uploaded profile picture (multer sets req.file)
    let profile_picture = null;
    if (req.file && req.file.filename) {
      profile_picture = `/uploads/${req.file.filename}`; // public path to image
    }

    // Hash password before saving
    const hashed = await hashPassword(password);

    // Insert owner into DB using parameterized query to avoid injection
    const insertSql = `
      INSERT INTO owners
        (name, email, password, phone, dob, gender, city, profile_picture, is_verified, rating, number_of_listings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, NOW(), NOW())
    `;
    const params = [name, email, hashed, phone || null, dob || null, gender || null, city || null, profile_picture];

    const [result] = await pool.query(insertSql, params);

    // Construct user object to return (omit password)
    const user = {
      id: result.insertId,
      name,
      email,
      phone: phone || null,
      dob: dob || null,
      gender: gender || null,
      city: city || null,
      profile_picture: profile_picture || null,
      role: 'owner'
    };

    // Create token for the newly created owner
    const token = createToken(user);

    // Respond with token + user for frontend auto-login
    return res.status(201).json({ token, user });
  } catch (err) {
    // If file was uploaded and error occurred, attempt to remove the file (best-effort)
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.warn('Failed to unlink uploaded file after owner signup error', unlinkErr);
      });
    }

    // Log error and return internal_server_error with detail for debugging
    console.error('owner signup error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

/**
 * Owner login
 * - Accepts { email } + password OR { phone } + password
 * - Validates credentials, returns { token, user } on success
 */
async function login(req, res) {
  try {
    // Read credentials
    const { email, phone, password } = req.body || {};

    // Validate presence
    if ((!email && !phone) || !password) {
      return res.status(400).json({ error: 'missing_credentials', message: 'Provide email or phone and password' });
    }

    // Build query based on provided identifier
    let sql = 'SELECT id, name, email, password, phone, dob, gender, profile_picture, is_verified FROM owners WHERE ';
    let params = [];
    if (email) {
      sql += 'LOWER(email) = LOWER(?) LIMIT 1';
      params = [email];
    } else {
      sql += 'phone = ? LIMIT 1';
      params = [phone];
    }

    // Query DB for owner row
    const [rows] = await pool.query(sql, params);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email/phone or password' });
    }

    const ownerRow = rows[0];

    // Compare password hashes
    const ok = await comparePassword(password, ownerRow.password);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email/phone or password' });
    }

    // Build user object (omit password)
    const user = {
      id: ownerRow.id,
      name: ownerRow.name,
      email: ownerRow.email,
      phone: ownerRow.phone,
      dob: ownerRow.dob,
      gender: ownerRow.gender,
      profile_picture: ownerRow.profile_picture,
      is_verified: ownerRow.is_verified,
      role: 'owner'
    };

    // Create token
    const token = createToken(user);

    // Respond with token and owner object
    return res.json({ token, user });
  } catch (err) {
    console.error('owner login error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

/**
 * Get owner profile
 * - Returns owner details by id param or authenticated user (req.user.id expected if auth middleware used)
 */
async function getProfile(req, res) {
  try {
    // prefer param id, else use req.user from auth middleware if present
    const id = Number(req.params.id || (req.user && req.user.id));
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    // Query owner data
    const [rows] = await pool.query('SELECT id, name, email, phone, dob, gender, profile_picture, is_verified, rating, number_of_listings, created_at FROM owners WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not_found' });

    // Return the owner row
    return res.json({ owner: rows[0] });
  } catch (err) {
    console.error('owner getProfile error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

/**
 * Update owner profile (partial)
 * - Allows updating name, phone, dob, gender, profile_picture (via multer req.file)
 */
async function updateProfile(req, res) {
  try {
    // Identify owner from token or params
    const ownerId = Number(req.user && req.user.id) || Number(req.params.id);
    if (!ownerId) return res.status(400).json({ error: 'invalid_id' });

    // Collect fields from body
    const { name, phone, dob, gender } = req.body || {};

    // If a new profile picture was uploaded via multer, build path
    let profile_picture = null;
    if (req.file && req.file.filename) {
      profile_picture = `/uploads/${req.file.filename}`;
    }

    // Build dynamic update
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
    if (dob !== undefined) { fields.push('dob = ?'); params.push(dob); }
    if (gender !== undefined) { fields.push('gender = ?'); params.push(gender); }
    if (profile_picture !== null) { fields.push('profile_picture = ?'); params.push(profile_picture); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'no_updates_provided' });
    }

    params.push(ownerId);
    const sql = `UPDATE owners SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
    const [result] = await pool.query(sql, params);

    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });

    return res.json({ message: 'profile_updated' });
  } catch (err) {
    console.error('owner updateProfile error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

/**
 * Get vehicles belonging to an owner
 * - Query vehicles table for records where owner_id = :id
 * - Optional query param ?available=1 or ?available=true filters by availability
 */
async function getVehicles(req, res) {
  try {
    // Owner id can come from params or authenticated token
    const ownerId = Number(req.params.ownerId || (req.user && req.user.id));
    if (!ownerId) return res.status(400).json({ error: 'invalid_owner_id' });

    // parse optional available filter
    const onlyAvailable = req.query.available === '1' || req.query.available === 'true';

    // Basic SQL: select main vehicle columns; ensure column names match your DB
    let sql = `SELECT id, owner_id, vehicle_type, make, model, year, registration_number, color, seating_capacity, daily_rate, photo_url, is_available, vehicle_condition, created_at FROM vehicles WHERE owner_id = ?`;
    const params = [ownerId];

    if (onlyAvailable) {
      sql += ' AND is_available = 1';
    }

    sql += ' ORDER BY created_at DESC';

    // Run query
    const [rows] = await pool.query(sql, params);

    // Keep listing count in sync
    await pool.query(
      'UPDATE owners SET number_of_listings = ? WHERE id = ?',
      [rows ? rows.length : 0, ownerId]
    );

    // Return list of vehicles
    return res.json({ vehicles: rows || [] });
  } catch (err) {
    console.error('owner getVehicles error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

/**
 * Optional: basic owner statistics (counts)
 * - Returns counts: total_vehicles, total_bookings, total_earnings (requires bookings table)
 * - This is a convenience endpoint for owner dashboard summary
 */
async function getStats(req, res) {
  try {
    const ownerId = Number(req.params.ownerId || (req.user && req.user.id));
    if (!ownerId) return res.status(400).json({ error: 'invalid_owner_id' });

    // Count vehicles
    const [[{ total_vehicles }]] = await pool.query('SELECT COUNT(*) AS total_vehicles FROM vehicles WHERE owner_id = ?', [ownerId]);

    // Count bookings and sum earnings (bookings table must have owner_id and total_price)
    const [[bookingRow]] = await pool.query('SELECT COUNT(*) AS total_bookings, IFNULL(SUM(total_price),0) AS total_earnings FROM bookings WHERE owner_id = ?', [ownerId]);

    return res.json({
      total_vehicles: Number(total_vehicles || 0),
      total_bookings: Number(bookingRow.total_bookings || 0),
      total_earnings: Number(bookingRow.total_earnings || 0)
    });
  } catch (err) {
    console.error('owner getStats error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

/**
 * Get bookings for an owner
 * - Placeholder until bookings table exists
 */
async function getBookings(req, res) {
  try {
    const ownerId = Number(req.params.ownerId || (req.user && req.user.id));
    if (!ownerId) return res.status(400).json({ error: 'invalid_owner_id' });
    return res.json({ bookings: [] });
  } catch (err) {
    console.error('owner getBookings error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// Export controller functions
module.exports = {
  signup,
  login,
  resetPassword,
  getProfile,
  updateProfile,
  getVehicles,
  getStats,
  getBookings
};
