// backend/src/controllers/customerController.js
// Purpose: Customer-related controller handlers (signup, login, profile, kyc)
// - Accepts both JSON and multipart/form-data (req.file handled by multer middleware if present)
// - Returns token + user on successful signup/login for frontend auto-login
// - Uses bcrypt for password hashing and jsonwebtoken for JWTs

// Import required modules
const bcrypt = require('bcrypt'); // password hashing
const jwt = require('jsonwebtoken'); // JWT generation
const { pool } = require('../db/connection'); // mysql2 pool exported from db/connection
const path = require('path'); // path utilities
const fs = require('fs'); // fs to optionally remove files on errors

// Load environment variables (e.g. JWT secret, token expiry)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'; // fallback secret for dev
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // token lifetime

// Helper: create a JWT token for a user object (minimally includes id, email, role)
function createToken(user) {
  // sign a token containing user id, email and role; use secret and expiry
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'customer' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Helper: hash a plaintext password using bcrypt
async function hashPassword(password) {
  // use salt rounds 10 for reasonable security/performance
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// Helper: compare plaintext password with hashed password
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
      'SELECT id FROM customers WHERE LOWER(email) = LOWER(?) AND DATE(dob) = DATE(?) LIMIT 1',
      [email, dob]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Email and DOB do not match any customer account',
      });
    }

    const hashed = await hashPassword(newPassword);
    await pool.query(
      'UPDATE customers SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashed, rows[0].id]
    );

    return res.json({ message: 'password_updated' });
  } catch (err) {
    console.error('customer resetPassword error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// Controller: signup (customer)
// Accepts JSON body or multipart/form-data (if you use multer to parse file)
// Expected fields: name, email, password (required), phone,dob,gender optional
// Optional file field (multipart) : profile_picture
async function signup(req, res) {
  try {
    // Extract fields from req.body (works for both JSON and multipart/form-data)
    const { name, email, password, phone, dob, gender } = req.body || {};

    // Basic validation: require name, email, password
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'missing_required_fields', message: 'name, email and password are required' });
    }

    // Ensure email uniqueness (case-insensitive)
    const [existingByEmail] = await pool.query('SELECT id FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
    if (existingByEmail && existingByEmail.length > 0) {
      return res.status(409).json({ error: 'email_exists', message: 'An account with this email already exists' });
    }

    // If phone provided, check uniqueness of phone too
    if (phone) {
      const [existingByPhone] = await pool.query('SELECT id FROM customers WHERE phone = ? LIMIT 1', [phone]);
      if (existingByPhone && existingByPhone.length > 0) {
        return res.status(409).json({ error: 'phone_exists', message: 'An account with this phone already exists' });
      }
    }

    // If profile image uploaded via multer, req.file will be present
    let profile_picture = null;
    if (req.file && req.file.filename) {
      // store public relative path to served uploads; depends on how you serve /public
      profile_picture = `/uploads/${req.file.filename}`;
    }

    // Hash password before storing
    const hashed = await hashPassword(password);

    // Insert new customer into DB - use parameterized query to prevent SQL injection
    const insertSql = `
      INSERT INTO customers
        (name, email, password, phone, dob, gender, profile_picture, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const params = [
      name,
      email,
      hashed,
      phone || null,
      dob || null,
      gender || null,
      profile_picture
    ];

    // Execute insert
    const [result] = await pool.query(insertSql, params);

    // Build user object to return (do not include password)
    const user = {
      id: result.insertId,
      name,
      email,
      phone: phone || null,
      dob: dob || null,
      gender: gender || null,
      profile_picture: profile_picture || null,
      role: 'customer'
    };

    // Create a JWT token for the new user
    const token = createToken(user);

    // Respond with token and basic user object so frontend can auto-login
    return res.status(201).json({ token, user });
  } catch (err) {
    // If an uploaded file exists and we encountered an error, consider removing the file to avoid orphan files
    if (req.file && req.file.path) {
      // Attempt to remove uploaded file (best-effort)
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.warn('Failed to remove uploaded file after signup error', unlinkErr);
      });
    }

    // Log and return generic error (include detail for debugging in dev)
    console.error('customer signup error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// Controller: login (customer)
// Accepts JSON body: { email } + { password } OR { phone } + { password }
// Returns token + user on success
async function login(req, res) {
  try {
    // Extract credentials from body
    const { email, phone, password } = req.body || {};

    // Validate presence
    if ((!email && !phone) || !password) {
      return res.status(400).json({ error: 'missing_credentials', message: 'Provide email or phone and password' });
    }

    // Build query depending on whether email or phone is provided
    let sql = 'SELECT id, name, email, password, phone, dob, gender, profile_picture FROM customers WHERE ';
    let params = [];

    if (email) {
      sql += 'LOWER(email) = LOWER(?) LIMIT 1';
      params = [email];
    } else {
      sql += 'phone = ? LIMIT 1';
      params = [phone];
    }

    // Execute DB lookup
    const [rows] = await pool.query(sql, params);

    // If no user found
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email/phone or password' });
    }

    // User found - compare password
    const userRow = rows[0];

    // Compare hashed password
    const ok = await comparePassword(password, userRow.password);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email/phone or password' });
    }

    // Build user object to return (omit password)
    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      phone: userRow.phone,
      dob: userRow.dob,
      gender: userRow.gender,
      profile_picture: userRow.profile_picture,
      role: 'customer'
    };

    // Create token
    const token = createToken(user);

    // Respond with token and user
    return res.json({ token, user });
  } catch (err) {
    console.error('customer login error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// Controller: getProfile
// Returns details for a given customer id (used by frontend to populate profile)
async function getProfile(req, res) {
  try {
    // Expect id via params (e.g., /api/customers/:id) or from authenticated token (req.user set by middleware)
    const id = Number(req.params.id || (req.user && req.user.id));
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    // Query DB
    const [rows] = await pool.query('SELECT id, name, email, phone, dob, gender, profile_picture, is_verified, kyc_submitted, kyc_verified, wallet_balance, created_at FROM customers WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not_found' });

    // Return the customer row
    return res.json({ customer: rows[0] });
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// Controller: uploadKyc - attach aadhar/license records for a customer
// Expects req.file(s) handled by multer (e.g., fields: aadhar_file, license_file) OR aadhar_number, license_number in body
// ========================= KYC Upload ===========================
async function uploadKyc(req, res) {
  try {
    const customerId = Number(req.params.id);
    if (!customerId) return res.status(400).json({ error: "Invalid customer id" });

    const { aadhar_number, license_number } = req.body;

    if (!aadhar_number || !license_number) {
      return res.status(400).json({ error: "Aadhar and License numbers required" });
    }

    const aadharFile = req.files?.aadhar_file?.[0];
    const licenseFile = req.files?.license_file?.[0];

    if (!aadharFile || !licenseFile) {
      return res.status(400).json({ error: "Both Aadhar and License photos required" });
    }

    // file paths (public/uploads/xxxx.jpg)
    const aadharPath = `/uploads/${aadharFile.filename}`;
    const licensePath = `/uploads/${licenseFile.filename}`;

    const q = `
      INSERT INTO kyc 
      (customer_id, aadhar_number, aadhar_photo, license_number, license_photo, status, admin_verified) 
      VALUES (?, ?, ?, ?, ?, 'submitted', 0)
      ON DUPLICATE KEY UPDATE
        aadhar_number = VALUES(aadhar_number),
        aadhar_photo = VALUES(aadhar_photo),
        license_number = VALUES(license_number),
        license_photo = VALUES(license_photo),
        status = 'submitted',
        admin_verified = 0
    `;

    await pool.execute(q, [
      customerId,
      aadhar_number,
      aadharPath,
      license_number,
      licensePath
    ]);

    // One-step customer verification
    await pool.execute(`UPDATE customers SET kyc_submitted = 1, kyc_verified = 0 WHERE id = ?`, [customerId]);

    res.json({
      message: "KYC submitted",
      status: "submitted",
      aadhar_photo: aadharPath,
      license_photo: licensePath
    });

  } catch (err) {
    console.error("uploadKyc error:", err);
    res.status(500).json({ error: "internal_server_error", detail: err.message });
  }
}

// Get KYC status & minimal info
async function getKycStatus(req, res) {
  try {
    const customerId = Number(req.params.id);
    if (!customerId) return res.status(400).json({ error: 'invalid customer id' });

    const [rows] = await pool.execute('SELECT * FROM kyc WHERE customer_id = ? LIMIT 1', [customerId]);
    const kyc = rows && rows[0] ? rows[0] : null;

    if (!kyc) {
      return res.json({ status: 'not_submitted', kyc: null });
    }

    // normalize response
    const response = {
      status: kyc.status || (kyc.admin_verified ? 'approved' : 'submitted'),
      admin_verified: !!kyc.admin_verified,
      aadhar_number: kyc.aadhar_number || null,
      aadhar_url: kyc.aadhar_photo || null,
      license_number: kyc.license_number || null,
      license_url: kyc.license_photo || null,
      updated_at: kyc.updated_at
    };

    return res.json({ kyc: response });
  } catch (err) {
    console.error('getKycStatus error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// Controller: updateProfile (partial update)
// Allows changing name, phone, dob, gender, and profile_picture (if req.file provided)
async function updateProfile(req, res) {
  try {
    // Authenticated user id or param
    const customerId = Number(req.user && req.user.id) || Number(req.params.id);
    if (!customerId) return res.status(400).json({ error: 'invalid_id' });

    // Collect updatable fields from body
    const { name, phone, dob, gender } = req.body || {};

    // If file present, set profile_picture
    let profile_picture = null;
    if (req.file && req.file.filename) {
      profile_picture = `/uploads/${req.file.filename}`;
    }

    // Build dynamic update query
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

    // Add updated_at and where
    params.push(customerId);
    const sql = `UPDATE customers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
    const [result] = await pool.query(sql, params);

    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });

    return res.json({ message: 'profile_updated' });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

async function getRecentBookings(req, res) {
  const customerId = Number(req.params.id);
  if (!customerId) return res.status(400).json({ error: 'invalid_id' });

  // TEMP: until bookings table exists
  return res.json({ bookings: [] });
}


// Export controllers
module.exports = {
  signup,
  login,
  resetPassword,
  getProfile,
  uploadKyc,
  updateProfile,
  getKycStatus,
  getRecentBookings,
};
