// src/middlewares/authMiddleware.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this';

function authenticateJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // payload.sub (id), role, email
    next();
  } catch (err) {
    console.error('JWT verify failed', err);
    return res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = { authenticateJWT };
