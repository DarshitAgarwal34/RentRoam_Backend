// File: src/models/adminModel.js
// Purpose: raw-query based utilities for the admins table
// Exports: createAdmin, getAdminByEmail, getAdminById, listAdmins, updateAdmin, setAdminActive

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/connection');

// Create a new admin
// data = { name, email, password, phone, dob, age, gender, profile_picture, role, role_level, is_active }
async function createAdmin(data) {
  const hashedPassword = await bcrypt.hash(String(data.password), 10);
  const sql = `
    INSERT INTO admins (name, email, password, phone, dob, age, gender, profile_picture, role, role_level, is_active)
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
    data.role || 'admin',
    data.role_level || 1,
    data.is_active === false ? 0 : 1
  ];

  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(sql, params);
    return { id: result.insertId };
  } finally {
    conn.release();
  }
}

// Get admin by email (includes password hash)
async function getAdminByEmail(email) {
  const sql = `SELECT * FROM admins WHERE email = ? LIMIT 1`;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, [email]);
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } finally {
    conn.release();
  }
}

// Get admin by id
async function getAdminById(id) {
  const sql = `SELECT * FROM admins WHERE id = ? LIMIT 1`;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, [id]);
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } finally {
    conn.release();
  }
}

// List admins with optional pagination
async function listAdmins(page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;
  const sql = `SELECT id, name, email, phone, role, role_level, is_active, created_at FROM admins ORDER BY id DESC LIMIT ? OFFSET ?`;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, [pageSize, offset]);
    return rows;
  } finally {
    conn.release();
  }
}

// Update admin fields (partial)
async function updateAdmin(adminId, fields) {
  const allowed = ['name','phone','profile_picture','role','role_level','is_active','dob','age','gender'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return false;
  const sql = `UPDATE admins SET ${sets.join(', ')} WHERE id = ?`;
  params.push(adminId);
  const conn = await pool.getConnection();
  try {
    const [res] = await conn.query(sql, params);
    return res.affectedRows === 1;
  } finally {
    conn.release();
  }
}

// Activate / deactivate admin
async function setAdminActive(adminId, isActive) {
  const sql = `UPDATE admins SET is_active = ? WHERE id = ?`;
  const conn = await pool.getConnection();
  try {
    const [res] = await conn.query(sql, [isActive ? 1 : 0, adminId]);
    return res.affectedRows === 1;
  } finally {
    conn.release();
  }
}

module.exports = {
  createAdmin,
  getAdminByEmail,
  getAdminById,
  listAdmins,
  updateAdmin,
  setAdminActive
};

// End of file
