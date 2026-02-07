const customerModel = require('../models/customerModel');
const ownerModel = require('../models/ownerModel');
const vehicleModel = require('../models/vehicleModel');
const { pool } = require('../db/connection');

// GET /api/admins/customers
async function listCustomers(req, res) {
  try {
    const customers = await customerModel.listAllCustomers();
    res.json({ customers });
  } catch (err) {
    console.error('listCustomers error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
}

// GET /api/admins/owners
async function listOwners(req, res) {
  try {
    const owners = await ownerModel.listAllOwners();
    res.json({ owners });
  } catch (err) {
    console.error('listOwners error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
}

// GET /api/admins/stats
async function getStats(req, res) {
  try {
    const [customers, owners, vehicles] = await Promise.all([
      customerModel.countCustomers(),
      ownerModel.countOwners(),
      vehicleModel.countVehicles()
    ]);

    const [[kycRow]] = await pool.query(`
      SELECT
        SUM(CASE WHEN kyc_submitted = 1 THEN 1 ELSE 0 END) AS kyc_submitted,
        SUM(CASE WHEN kyc_verified = 1 THEN 1 ELSE 0 END) AS kyc_verified,
        SUM(CASE WHEN kyc_submitted = 0 THEN 1 ELSE 0 END) AS kyc_not_submitted
      FROM customers
    `);

    let totalBookings = 0;
    try {
      const [[bk]] = await pool.query(`SELECT COUNT(*) AS total FROM bookings`);
      totalBookings = Number(bk.total || 0);
    } catch (err) {
      totalBookings = 0;
    }

    res.json({
      customers,
      owners,
      vehicles,
      totalBookings,
      kycSubmitted: Number(kycRow.kyc_submitted || 0),
      kycVerified: Number(kycRow.kyc_verified || 0),
      kycNotSubmitted: Number(kycRow.kyc_not_submitted || 0)
    });
  } catch (err) {
    console.error('admin stats error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
}

async function listPendingKyc(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, email, phone, kyc_submitted, kyc_verified,
             aadhar_file, license_file, created_at
      FROM customers
      WHERE kyc_submitted = 1 AND kyc_verified = 0
      ORDER BY created_at DESC
    `);

    res.json({ customers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_server_error' });
  }
}

/**
 * PATCH /api/admins/customers/:id/kyc
 * body: { approve: true/false }
 */
async function updateKycStatus(req, res) {
  const id = Number(req.params.id);
  const { approve } = req.body;

  if (!id || typeof approve !== 'boolean') {
    return res.status(400).json({ error: 'invalid input' });
  }

  try {
    await pool.query(
      `UPDATE customers
       SET kyc_verified = ?, is_verified = ?
       WHERE id = ?`,
      [approve ? 1 : 0, id]
    );

    res.json({ message: approve ? 'kyc_approved' : 'kyc_rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_server_error' });
  }
}

// PATCH /api/admins/customers/:id
async function updateCustomer(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const {
      name,
      email,
      phone,
      dob,
      gender,
      license_number,
      aadhar_plain,
      is_verified,
      kyc_submitted,
      kyc_verified
    } = req.body || {};

    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (email !== undefined) { fields.push('email = ?'); params.push(email); }
    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
    if (dob !== undefined) { fields.push('dob = ?'); params.push(dob); }
    if (gender !== undefined) {
      const g = String(gender || '').trim().toLowerCase();
      if (!g) {
        fields.push('gender = ?'); params.push(null);
      } else if (['male', 'female', 'other'].includes(g)) {
        fields.push('gender = ?'); params.push(g);
      } else {
        return res.status(400).json({ error: 'invalid_gender' });
      }
    }
    if (license_number !== undefined) { fields.push('license_number = ?'); params.push(license_number); }
    if (typeof is_verified === 'boolean') { fields.push('is_verified = ?'); params.push(is_verified ? 1 : 0); }
    if (typeof kyc_submitted === 'boolean') { fields.push('kyc_submitted = ?'); params.push(kyc_submitted ? 1 : 0); }
    if (typeof kyc_verified === 'boolean') { fields.push('kyc_verified = ?'); params.push(kyc_verified ? 1 : 0); }

    if (aadhar_plain !== undefined) {
      const buf = customerModel.encryptAadhar(aadhar_plain);
      fields.push('aadhar_cipher = ?');
      params.push(buf);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'no_updates' });

    params.push(id);
    await pool.query(`UPDATE customers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    return res.json({ message: 'customer_updated' });
  } catch (err) {
    console.error('updateCustomer error', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// GET /api/admins/customers/:id
async function getCustomerById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    const customer = await customerModel.getCustomerById(id);
    if (!customer) return res.status(404).json({ error: 'not_found' });
    res.json({ customer });
  } catch (err) {
    console.error('getCustomerById error', err);
    res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// DELETE /api/admins/customers/:id
async function deleteCustomer(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    await pool.query('DELETE FROM customers WHERE id = ?', [id]);
    return res.json({ message: 'customer_deleted' });
  } catch (err) {
    console.error('deleteCustomer error', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// PATCH /api/admins/owners/:id
async function updateOwner(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const { name, email, phone, dob, gender, is_verified, city } = req.body || {};

    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (email !== undefined) { fields.push('email = ?'); params.push(email); }
    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
    if (dob !== undefined) { fields.push('dob = ?'); params.push(dob); }
    if (gender !== undefined) { fields.push('gender = ?'); params.push(gender); }
    if (city !== undefined) { fields.push('city = ?'); params.push(city); }
    if (typeof is_verified === 'boolean') { fields.push('is_verified = ?'); params.push(is_verified ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ error: 'no_updates' });

    params.push(id);
    await pool.query(`UPDATE owners SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    return res.json({ message: 'owner_updated' });
  } catch (err) {
    console.error('updateOwner error', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

// DELETE /api/admins/owners/:id
async function deleteOwner(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    await pool.query('DELETE FROM vehicles WHERE owner_id = ?', [id]);
    await pool.query('DELETE FROM owners WHERE id = ?', [id]);
    return res.json({ message: 'owner_deleted' });
  } catch (err) {
    console.error('deleteOwner error', err);
    return res.status(500).json({ error: 'internal_server_error', detail: err.message });
  }
}

module.exports = {
  listCustomers,
  getCustomerById,
  listOwners,
  getStats,
  listPendingKyc,
  updateKycStatus,
  updateCustomer,
  deleteCustomer,
  updateOwner,
  deleteOwner
};
