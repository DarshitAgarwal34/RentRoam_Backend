const { pool } = require("../db/connection");

const CREATE_BOOKINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS bookings (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    owner_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    pickup_city VARCHAR(255) NULL,
    payment_method VARCHAR(50) NULL,
    notes TEXT NULL,
    total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bookings_customer_id (customer_id),
    INDEX idx_bookings_owner_id (owner_id),
    INDEX idx_bookings_vehicle_id (vehicle_id)
  )
`;

let ensured = false;

async function ensureBookingsTable() {
  if (ensured) return;
  await pool.query(CREATE_BOOKINGS_TABLE_SQL);
  ensured = true;
}

async function createBooking({
  customer_id,
  owner_id,
  vehicle_id,
  start_date,
  end_date,
  pickup_city,
  payment_method,
  notes,
  total_price,
  status = "confirmed",
}) {
  await ensureBookingsTable();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[vehicle]] = await conn.query(
      `
        SELECT v.*, o.name AS owner_name, o.email AS owner_email
        FROM vehicles v
        LEFT JOIN owners o ON o.id = v.owner_id
        WHERE v.id = ?
        LIMIT 1
      `,
      [vehicle_id]
    );

    if (!vehicle) {
      throw Object.assign(new Error("Vehicle not found"), {
        statusCode: 404,
        code: "vehicle_not_found",
      });
    }

    if (!vehicle.is_available) {
      throw Object.assign(new Error("Vehicle is not available"), {
        statusCode: 409,
        code: "vehicle_unavailable",
      });
    }

    const [[customer]] = await conn.query(
      `SELECT id, name, email FROM customers WHERE id = ? LIMIT 1`,
      [customer_id]
    );

    if (!customer) {
      throw Object.assign(new Error("Customer not found"), {
        statusCode: 404,
        code: "customer_not_found",
      });
    }

    const finalOwnerId = owner_id || vehicle.owner_id;
    if (!finalOwnerId) {
      throw Object.assign(new Error("Vehicle owner not found"), {
        statusCode: 400,
        code: "owner_not_found",
      });
    }

    const [result] = await conn.query(
      `
        INSERT INTO bookings
          (customer_id, owner_id, vehicle_id, start_date, end_date, pickup_city, payment_method, notes, total_price, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        customer_id,
        finalOwnerId,
        vehicle_id,
        start_date,
        end_date,
        pickup_city || null,
        payment_method || null,
        notes || null,
        Number(total_price || 0),
        status,
      ]
    );

    await conn.query(
      `UPDATE vehicles SET is_available = 0 WHERE id = ?`,
      [vehicle_id]
    );

    await conn.commit();

    return {
      id: result.insertId,
      customer_id,
      owner_id: finalOwnerId,
      vehicle_id,
      start_date,
      end_date,
      pickup_city: pickup_city || null,
      payment_method: payment_method || null,
      notes: notes || null,
      total_price: Number(total_price || 0),
      status,
      vehicle: {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        daily_rate: vehicle.daily_rate,
        photo_url: vehicle.photo_url,
        primary_photo: vehicle.photo_url,
      },
      customer,
      owner: {
        id: finalOwnerId,
        name: vehicle.owner_name || null,
        email: vehicle.owner_email || null,
      },
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

async function listCustomerBookings(customerId, limit = 50) {
  await ensureBookingsTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const [rows] = await pool.query(
    `
      SELECT
        b.*,
        v.make AS vehicle_make,
        v.model AS vehicle_model,
        v.year AS vehicle_year,
        v.color AS vehicle_color,
        v.daily_rate AS vehicle_daily_rate,
        v.photo_url AS vehicle_photo_url,
        o.name AS owner_name,
        o.email AS owner_email
      FROM bookings b
      INNER JOIN vehicles v ON v.id = b.vehicle_id
      LEFT JOIN owners o ON o.id = b.owner_id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `,
    [customerId, safeLimit]
  );

  return rows.map(normalizeBookingRow);
}

async function listOwnerBookings(ownerId, limit = 50) {
  await ensureBookingsTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const [rows] = await pool.query(
    `
      SELECT
        b.*,
        v.make AS vehicle_make,
        v.model AS vehicle_model,
        v.year AS vehicle_year,
        v.color AS vehicle_color,
        v.daily_rate AS vehicle_daily_rate,
        v.photo_url AS vehicle_photo_url,
        c.name AS customer_name,
        c.email AS customer_email
      FROM bookings b
      INNER JOIN vehicles v ON v.id = b.vehicle_id
      LEFT JOIN customers c ON c.id = b.customer_id
      WHERE b.owner_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `,
    [ownerId, safeLimit]
  );

  return rows.map(normalizeBookingRow);
}

function normalizeBookingRow(row) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    owner_id: row.owner_id,
    vehicle_id: row.vehicle_id,
    start_date: row.start_date,
    end_date: row.end_date,
    pickup_city: row.pickup_city,
    payment_method: row.payment_method,
    notes: row.notes,
    total_price: Number(row.total_price || 0),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    vehicle_make: row.vehicle_make,
    vehicle_model: row.vehicle_model,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    owner_name: row.owner_name,
    owner_email: row.owner_email,
    vehicle: {
      id: row.vehicle_id,
      make: row.vehicle_make,
      model: row.vehicle_model,
      year: row.vehicle_year,
      color: row.vehicle_color,
      daily_rate: row.vehicle_daily_rate,
      photo_url: row.vehicle_photo_url,
      primary_photo: row.vehicle_photo_url,
    },
    customer: row.customer_name || row.customer_email
      ? {
          name: row.customer_name || null,
          email: row.customer_email || null,
        }
      : null,
    owner: row.owner_name || row.owner_email
      ? {
          name: row.owner_name || null,
          email: row.owner_email || null,
        }
      : null,
  };
}

module.exports = {
  ensureBookingsTable,
  createBooking,
  listCustomerBookings,
  listOwnerBookings,
};
