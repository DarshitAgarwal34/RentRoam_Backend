// backend/src/models/vehicleModel.js
// Raw SQL model for vehicles using mysql2 pool.
// Exports functions used by controllers including single create and bulk create.

const { pool } = require('../db/connection'); // your existing pool

// Normalize vehicle_type values (simple mapping)
function normalizeVehicleType(raw) {
  if (!raw) return null;
  const r = String(raw).trim().toLowerCase();
  if (['car', 'sedan', 'suv', 'hatchback'].includes(r)) return 'car';
  if (['bike', 'motorcycle', 'motorbike', 'motorcycle'.toLowerCase()].includes(r)) return 'bike';
  if (['scooter'].includes(r)) return 'scooter';
  // fallback to provided lowercase value (or 'other')
  return ['car', 'bike', 'scooter'].includes(r) ? r : 'other';
}

/**
 * createVehicle(data)
 * Insert a single vehicle and return { id: insertId }
 */
async function createVehicle(data) {
  // Map fields (accept both photo and photo_url keys)
  const {
    owner_id,
    make,
    model,
    year,
    color = null,
    seating_capacity = null,
    registration_number = null,
    vehicle_type,
    vehicle_condition = 'good',
    daily_rate,
    photo_url,
    photo
  } = data;

  const photoToUse = photo_url || photo || null;
  const vt = normalizeVehicleType(vehicle_type);

  const sql = `INSERT INTO vehicles
    (owner_id, make, model, year, color, seating_capacity, registration_number, vehicle_type, vehicle_condition, daily_rate, photo_url, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const params = [
    owner_id, make, model, year, color, seating_capacity, registration_number,
    vt, vehicle_condition, daily_rate, photoToUse, data.is_available == null ? 1 : (data.is_available ? 1 : 0)
  ];

  const [result] = await pool.query(sql, params);
  return { id: result.insertId };
}

/**
 * createVehiclesBulk(arr)
 * Insert multiple vehicles in a single transaction.
 * Returns { insertedCount, firstInsertId } on success.
 *
 * - Validates that each object has required fields (owner_id, make, model, year, vehicle_type, daily_rate).
 * - Normalizes vehicle_type and photo key.
 */
async function createVehiclesBulk(arr) {
  if (!Array.isArray(arr)) throw new Error('Expected array');

  if (arr.length === 0) return { insertedCount: 0, firstInsertId: null };

  // Validate entries and prepare values
  const rows = []; // array of param arrays
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    // simple validation
    if (!d.owner_id || !d.make || !d.model || !d.year || !d.vehicle_type || !d.daily_rate) {
      throw new Error(`Missing required fields in element index ${i}`);
    }

    const photoToUse = d.photo_url || d.photo || null;
    const vt = normalizeVehicleType(d.vehicle_type);

    rows.push([
      d.owner_id,
      d.make,
      d.model,
      d.year,
      d.color || null,
      d.seating_capacity || null,
      d.registration_number || null,
      vt,
      d.vehicle_condition || 'good',
      d.daily_rate,
      photoToUse,
      d.is_available == null ? 1 : (d.is_available ? 1 : 0)
    ]);
  }

  // Build placeholders for multi-row insert: (?, ?, ...), (?, ?, ...), ...
  const placeholdersPerRow = '(' + new Array(12).fill('?').join(',') + ')';
  const allPlaceholders = new Array(rows.length).fill(placeholdersPerRow).join(',');

  // Flatten params
  const flatParams = rows.flat();

  // SQL
  const sql = `INSERT INTO vehicles
    (owner_id, make, model, year, color, seating_capacity, registration_number, vehicle_type, vehicle_condition, daily_rate, photo_url, is_available)
    VALUES ${allPlaceholders}`;

  // Use transaction to be safe
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(sql, flatParams);
    await conn.commit();
    conn.release();
    return { insertedCount: result.affectedRows, firstInsertId: result.insertId };
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    throw err;
  }
}

/**
 * getVehicleById(id)
 * Simple fetch for a single vehicle row.
 */
async function getVehicleById(id) {
  const [rows] = await pool.query('SELECT * FROM vehicles WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/**
 * getVehiclesByOwner(ownerId, onlyAvailable)
 * Returns array of vehicles for owner. Optionally filter availability.
 */
async function getVehiclesByOwner(ownerId, onlyAvailable = false) {
  if (onlyAvailable) {
    const [rows] = await pool.query('SELECT * FROM vehicles WHERE owner_id = ? AND is_available = 1 ORDER BY created_at DESC', [ownerId]);
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM vehicles WHERE owner_id = ? ORDER BY created_at DESC', [ownerId]);
  return rows;
}

/**
 * updateVehicle(id, fields)
 * Partial update. fields is an object; builds SET dynamically.
 * Returns true if rows affected > 0
 */
async function updateVehicle(id, fields) {
  const allowed = ['make','model','year','color','seating_capacity','registration_number','vehicle_type','vehicle_condition','daily_rate','photo_url','is_available'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      if (k === 'vehicle_type') {
        params.push(normalizeVehicleType(fields[k]));
      } else if (k === 'is_available') {
        params.push(fields[k] ? 1 : 0);
      } else {
        params.push(fields[k]);
      }
      sets.push(`${k} = ?`);
    }
  }

  if (sets.length === 0) return false;

  const sql = `UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`;
  params.push(id);
  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
}

/**
 * setAvailability(vehicleId, available)
 */
async function setAvailability(vehicleId, available) {
  const [result] = await pool.query('UPDATE vehicles SET is_available = ? WHERE id = ?', [available ? 1 : 0, vehicleId]);
  return result.affectedRows > 0;
}

/**
 * addVehiclePhoto(vehicleId, photo)
 * Minimal implementation: if you have a photos table, you'll extend it.
 * For now this will update photo_url as primary photo.
 */
async function addVehiclePhoto(vehicleId, photo) {
  // if photo has photo_url, set vehicle.photo_url to it
  if (!photo || !photo.photo_url) throw new Error('photo_url required');
  const [result] = await pool.query('UPDATE vehicles SET photo_url = ? WHERE id = ?', [photo.photo_url, vehicleId]);
  return { id: vehicleId, updated: result.affectedRows > 0 };
}

/**
 * removeVehiclePhoto(photoId)
 * Placeholder — if you maintain a photos table implement there.
 */
async function removeVehiclePhoto(photoId) {
  // If you had photos table: delete from photos where id = ?
  // For now simply return false (not implemented)
  return false;
}

// returns array of vehicles (simple SELECT)
// place this function in backend/src/models/vehicleModel.js
async function getAllVehicles(filters = {}) {
  // base select - include owner.city as owner_city so frontend can display/filter
  let sql = `
    SELECT v.*, o.name AS owner_name, o.city AS owner_city
    FROM vehicles v
    LEFT JOIN owners o ON o.id = v.owner_id
  `;

  const where = [];
  const params = [];

  // city filter (matches owner.city)
  if (filters.city) {
    where.push('LOWER(o.city) = LOWER(?)');
    params.push(String(filters.city).trim());
  }

  // vehicle type filter: accept 'car', 'bike', 'scooter', etc.
  if (filters.type && filters.type !== 'all') {
    where.push('LOWER(v.vehicle_type) = LOWER(?)');
    params.push(String(filters.type).trim());
  }

  // availability filter
  if (typeof filters.available !== 'undefined') {
    where.push('v.is_available = ?');
    params.push(filters.available ? 1 : 0);
  }

  if (where.length) {
    sql += ' WHERE ' + where.join(' AND ');
  }

  sql += ' ORDER BY v.created_at DESC';

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countVehicles() {
  const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM vehicles`);
  return row.total;
}

async function deleteVehicle(id) {
  const [result] = await pool.query('DELETE FROM vehicles WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function syncOwnerListingCount(ownerId) {
  if (!ownerId) return;
  const sql = `
    UPDATE owners
    SET number_of_listings = (SELECT COUNT(*) FROM vehicles WHERE owner_id = ?)
    WHERE id = ?
  `;
  await pool.query(sql, [ownerId, ownerId]);
}


module.exports = {
  createVehicle,
  createVehiclesBulk,
  getVehicleById,
  getVehiclesByOwner,
  updateVehicle,
  deleteVehicle,
  setAvailability,
  addVehiclePhoto,
  removeVehiclePhoto,
  getAllVehicles,
  countVehicles,
  syncOwnerListingCount
};
