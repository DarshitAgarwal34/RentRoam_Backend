// File: src/models/ownerModel.js
// Raw-query model utilities for the owners table
// Exports: createOwner, getOwnerByEmail, getOwnerById, updateOwnerProfile

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/connection');

// Create a new owner
// data: { name, email, password, phone, dob, age, gender, profile_picture, is_verified, rating, number_of_listings }
async function createOwner(data) {
  const hashedPassword = await bcrypt.hash(String(data.password), 10);
  const sql = `
    INSERT INTO owners (name, email, password, phone, dob, age, gender, profile_picture, is_verified, rating, number_of_listings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.name,
    data.email,
    hashedPassword,
    data.phone || null,
    data.dob || null,
    data.age || null,
    data.gender || null,
    data.profile_picture || null,
    data.is_verified ? 1 : 0,
    data.rating || null,
    data.number_of_listings || 0
  ];

  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(sql, params);
    return { id: result.insertId };
  } finally {
    conn.release();
  }
}

// Get owner by email (returns full row including password; controller may delete password)
async function getOwnerByEmail(email) {
  const sql = `SELECT * FROM owners WHERE email = ? LIMIT 1`;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, [email]);
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } finally {
    conn.release();
  }
}

// Get owner by id
async function getOwnerById(id) {
  const sql = `SELECT * FROM owners WHERE id = ? LIMIT 1`;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, [id]);
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } finally {
    conn.release();
  }
}

// Update owner profile (partial update)
// allowed: name, phone, profile_picture, is_verified, rating, number_of_listings, dob, age, gender
async function updateOwnerProfile(ownerId, fields) {
  const allowed = ['name','phone','profile_picture','is_verified','rating','number_of_listings','dob','age','gender'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return false;
  const sql = `UPDATE owners SET ${sets.join(', ')} WHERE id = ?`;
  params.push(ownerId);
  const conn = await pool.getConnection();
  try {
    const [res] = await conn.query(sql, params);
    return res.affectedRows === 1;
  } finally {
    conn.release();
  }
}

async function listAllOwners() {
  const [rows] = await pool.query(`
    SELECT
      id,
      name,
      email,
      phone,
      dob,
      gender,
      is_verified,
      number_of_listings,
      created_at
    FROM owners
    ORDER BY created_at DESC
  `);
  return rows;
}

async function countOwners() {
  const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM owners`);
  return row.total;
}


// Explicitly export the functions
module.exports = {
  createOwner,
  getOwnerByEmail,
  getOwnerById,
  updateOwnerProfile,
  listAllOwners,
  countOwners
};
