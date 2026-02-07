// File: src/routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const upload = require("./../middlewares/upload")
const customerController = require('../controllers/customerController');

// POST /api/customers/signup
router.post('/signup', upload.single('profile_picture'), customerController.signup);

// POST /api/customers/login
router.post('/login', customerController.login);

// GET /api/customers/:id
const auth = require('../middlewares/authMiddleware');
router.get('/:id', auth.authenticateJWT, customerController.getProfile);

// KYC UPLOAD — DISK STORAGE
router.post(
  '/:id/kyc',
  upload.fields([
    { name: 'aadhar_file', maxCount: 1 },
    { name: 'license_file', maxCount: 1 }
  ]),
  customerController.uploadKyc
);

// Get KYC Status
router.get('/:id/kyc', customerController.getKycStatus);

router.get('/:id/bookings', auth.authenticateJWT, customerController.getRecentBookings);


module.exports = router;
