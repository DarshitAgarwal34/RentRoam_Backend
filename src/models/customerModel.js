// File: src/models/customerModel.js
// Purpose: raw-query based "model" utilities for the customers table
// - uses mysql2 pool exported from src/db/connection.js
// - encrypts/decrypts Aadhaar in the application layer using AES-256-GCM
// - demonstrates basic CRUD helpers: createCustomer, getCustomerByEmail, getCustomerById

// Load dotenv so we can read encryption secret from process.env
require('dotenv').config();

// Import the Node crypto module to perform AES-GCM encryption/decryption
const crypto = require('crypto');

// Import bcryptjs for password hashing (recommended). Install with: npm install bcryptjs
const bcrypt = require('bcryptjs');

// Import the MySQL connection pool we created earlier
const { pool } = require('../db/connection');

// Constants for AES-GCM
const AADHAR_KEY = process.env.AADHAR_KEY || 'change_this_to_a_strong_secret_in_env';
const IV_LENGTH = 12; // 12 bytes is recommended for GCM
const AUTH_TAG_LENGTH = 16; // GCM auth tag length

// Helper: derive a 32-byte key from AADHAR_KEY using SHA-256
function deriveKey(secret) {
  // create a 32-byte key (AES-256) by hashing the secret
  return crypto.createHash('sha256').update(String(secret)).digest();
}

// Helper: encrypt plaintext Aadhaar number (string) -> Buffer (iv + authTag + ciphertext)
function encryptAadhar(plainText) {
  // generate random iv
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(AADHAR_KEY);

  // create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // encrypt the plaintext (utf8 input -> Buffer output)
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);

  // get authentication tag
  const authTag = cipher.getAuthTag();

  // final payload: iv (12) + authTag (16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

// Helper: decrypt Buffer (iv + authTag + ciphertext) -> plaintext string
function decryptAadhar(cipherBuffer) {
  if (!cipherBuffer) return null;

  // buffer layout: [0..11] iv, [12..27] authTag, [28..end] ciphertext
  const iv = cipherBuffer.slice(0, IV_LENGTH);
  const authTag = cipherBuffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = cipherBuffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(AADHAR_KEY);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// Create a new customer record
// data = { name, email, password, phone, dob, gender, profile_picture, license_number, aadhar_plain }
async function createCustomer(data) {
  // Hash password before storing
  const saltRounds = 10; // bcrypt work factor
  const hashedPassword = await bcrypt.hash(String(data.password), saltRounds);

  // Encrypt Aadhaar if provided, store as Buffer (VARBINARY)
  const aadharBuffer = data.aadhar_plain ? encryptAadhar(data.aadhar_plain) : null;

  // Prepare SQL - parameterized to avoid SQL injection
  const sql = `
    INSERT INTO customers
      (name, email, password, phone, dob, age, gender, profile_picture, license_number, aadhar_cipher, is_verified, wallet_balance, rating, preferences)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Age can be provided or NULL. Preferences stored as JSON string if provided.
  const preferencesJson = data.preferences ? JSON.stringify(data.preferences) : null;

  const params = [
    data.name,
    data.email,
    hashedPassword,
    data.phone || null,
    data.dob || null,
    data.age || null,
    data.gender || null,
    data.profile_picture || null,
    data.license_number || null,
    aadharBuffer,
    data.is_verified ? 1 : 0,
    data.wallet_balance != null ? data.wallet_balance : 0.0,
    data.rating || null,
    preferencesJson
  ];

  // Execute the query using the pool
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(sql, params);
    // result.insertId contains the new customer's id
    return { id: result.insertId };
  } finally {
    conn.release();
  }
}

// Get customer by email (returns decrypted aadhar as aadhar_plain)
async function getCustomerByEmail(email) {
  const sql = `SELECT * FROM customers WHERE email = ? LIMIT 1`;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, [email]);
    if (!rows || rows.length === 0) return null;

    const row = rows[0];

    // decrypt aadhar if present (row.aadhar_cipher will be a Buffer because column is VARBINARY)
    const aadharPlain = row.aadhar_cipher ? decryptAadhar(row.aadhar_cipher) : null;

    // remove password before returning raw data; include aadhar_plain separately
    delete row.password;
    row.aadhar_plain = aadharPlain;

    return row;
  } finally {
    conn.release();
  }
}

// Get customer by id
async function getCustomerById(id) {
  const sql = `SELECT * FROM customers WHERE id = ? LIMIT 1`;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, [id]);
    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    const aadharPlain = row.aadhar_cipher ? decryptAadhar(row.aadhar_cipher) : null;
    delete row.password;
    row.aadhar_plain = aadharPlain;
    return row;
  } finally {
    conn.release();
  }
}

// Update customer's Aadhaar (accepts plaintext aadhaar and overwrites aadhar_cipher)
async function updateCustomerAadhar(customerId, newAadharPlain) {
  const aadharBuffer = encryptAadhar(newAadharPlain);
  const sql = `UPDATE customers SET aadhar_cipher = ? WHERE id = ?`;
  const conn = await pool.getConnection();
  try {
    const [res] = await conn.query(sql, [aadharBuffer, customerId]);
    return res.affectedRows === 1;
  } finally {
    conn.release();
  }
}

async function listAllCustomers() {
  const [rows] = await pool.query(`
    SELECT
      id,
      name,
      email,
      phone,
      dob,
      gender,
      license_number,
      aadhar_cipher,
      is_verified,
      kyc_submitted,
      kyc_verified,
      created_at
    FROM customers
    ORDER BY created_at DESC
  `);
  return (rows || []).map((row) => {
    let aadharPlain = null;
    try {
      if (row.aadhar_cipher && Buffer.isBuffer(row.aadhar_cipher)) {
        aadharPlain = decryptAadhar(row.aadhar_cipher);
      }
    } catch {
      aadharPlain = null;
    }
    const clean = { ...row, aadhar_plain: aadharPlain };
    delete clean.aadhar_cipher;
    return clean;
  });
}

async function countCustomers() {
  const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM customers`);
  return row.total;
}


// Exports
module.exports = {
  encryptAadhar,
  decryptAadhar,
  createCustomer,
  getCustomerByEmail,
  getCustomerById,
  updateCustomerAadhar,
  listAllCustomers,
  countCustomers
};

// End of file
