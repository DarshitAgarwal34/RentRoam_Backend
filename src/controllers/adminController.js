// File: src/controllers/adminController.js
// Purpose: admin signup/login and basic admin actions (list, get profile, activate/deactivate)
// - Issues JWT tokens with role = 'admin'
// - Uses src/models/adminModel.js for raw DB operations

require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
  createAdmin,
  getAdminByEmail,
  getAdminById,
  listAdmins,
  updateAdmin,
  setAdminActive,
} = require("../models/adminModel");

const JWT_SECRET = process.env.JWT_SECRET || "change_this";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// small helper to sign JWT
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function resetPassword(req, res) {
  try {
    const { email, dob, newPassword } = req.body || {};
    if (!email || !dob || !newPassword) {
      return res.status(400).json({
        error: "email, dob and newPassword required",
      });
    }

    const adminRow = await getAdminByEmail(email);
    const adminDob = adminRow?.dob ? new Date(adminRow.dob).toISOString().slice(0, 10) : null;
    if (!adminRow || adminDob !== dob) {
      return res.status(404).json({ error: "admin_not_found" });
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);
    await updateAdmin(adminRow.id, { password: hashedPassword });

    return res.json({ message: "password_updated" });
  } catch (err) {
    console.error("admin resetPassword error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

// POST /api/admins/signup
// Creates a new admin (you may want to restrict who can call this in production)
async function signup(req, res) {
  try {
    const {
      name,
      email,
      password,
      phone,
      dob,
      age,
      gender,
      profile_picture,
      role,
      role_level,
    } = req.body;
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ error: "name, email and password required" });

    // check duplicate
    const existing = await getAdminByEmail(email);
    if (existing)
      return res.status(409).json({ error: "email already registered" });

    const result = await createAdmin({
      name,
      email,
      password,
      phone,
      dob,
      age,
      gender,
      profile_picture,
      role,
      role_level,
      is_active: true,
    });

    const user = await getAdminById(result.id);
    if (user) {
      user.role = user.role || "admin";
      delete user.password;
    }

    const token = signToken({ sub: user.id, role: "admin", email: user.email });
    return res.status(201).json({ id: result.id, token, user });
  } catch (err) {
    console.error("admin signup error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

// POST /api/admins/login
// Body: { email, password }
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });

    // fetch admin raw (includes password)
    const adminRow = await getAdminByEmail(email);
    if (!adminRow)
      return res.status(401).json({ error: "invalid credentials" });

    const match = await bcrypt.compare(String(password), adminRow.password);
    if (!match) return res.status(401).json({ error: "invalid credentials" });

    // build safe user object
    const user = await getAdminById(adminRow.id);
    if (user) {
      user.role = user.role || "admin";
      delete user.password;
    }

    const token = signToken({ sub: user.id, role: "admin", email: user.email });
    return res.json({ token, user });
  } catch (err) {
    console.error("admin login error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

// GET /api/admins
// List admins (paginated). Query: ?page=1&pageSize=20
async function listAdminsHandler(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const rows = await listAdmins(page, pageSize);
    return res.json({ admins: rows, page, pageSize });
  } catch (err) {
    console.error("listAdmins error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

// GET /api/admins/:id
async function getAdminProfile(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });
    const user = await getAdminById(id);
    if (!user) return res.status(404).json({ error: "not_found" });
    delete user.password;
    return res.json({ user });
  } catch (err) {
    console.error("getAdminProfile error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

// PATCH /api/admins/:id/activate
// Body: { active: true/false }
async function setActiveHandler(req, res) {
  try {
    const id = Number(req.params.id);
    const active = req.body.active;
    if (!id || typeof active !== "boolean")
      return res.status(400).json({ error: "invalid input" });

    const ok = await setAdminActive(id, active);
    if (!ok) return res.status(404).json({ error: "not_found" });

    return res.json({ message: "updated" });
  } catch (err) {
    console.error("setActive error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

// PATCH /api/admins/:id
// Partial update for admin fields (name, phone, role_level, etc.)
async function updateAdminHandler(req, res) {
  try {
    // req.user is already admin from JWT
    const adminId = req.user.sub;
    const fields = req.body;
    if (!id) return res.status(400).json({ error: "invalid id" });

    const ok = await updateAdmin(id, fields);
    if (!ok) return res.status(404).json({ error: "not_found_or_no_changes" });

    return res.json({ message: "updated" });
  } catch (err) {
    console.error("updateAdmin error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

module.exports = {
  signup,
  login,
  resetPassword,
  listAdminsHandler,
  getAdminProfile,
  setActiveHandler,
  updateAdminHandler,
};
