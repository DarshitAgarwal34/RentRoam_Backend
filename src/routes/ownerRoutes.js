// src/routes/ownerRoutes.js
const express = require('express');
const router = express.Router();
const upload = require('./../middlewares/upload');
const ownerController = require('../controllers/ownerController');

router.post('/signup', upload.single('profile_picture'), ownerController.signup);
router.post('/login', ownerController.login);
router.get('/:ownerId', ownerController.getProfile);
router.put('/:ownerId', upload.single('profile_picture'), ownerController.updateProfile);
router.get('/:ownerId/vehicles', ownerController.getVehicles);
router.get('/:ownerId/stats', ownerController.getStats);
router.get('/:ownerId/bookings', ownerController.getBookings);

module.exports = router;
