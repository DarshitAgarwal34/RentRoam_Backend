// src/middlewares/requireRole.js
// Usage: requireRole('admin') or requireRole('owner'), etc.

function requireRole(role) {
  return function (req, res, next) {
    // authenticateJWT should have already attached req.user
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });

    // req.user may include { sub, role, email }
    if (!req.user.role) return res.status(403).json({ error: 'forbidden' });

    if (req.user.role !== role) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

module.exports = { requireRole };
