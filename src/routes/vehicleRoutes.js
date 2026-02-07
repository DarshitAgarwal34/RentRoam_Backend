// File: src/routes/vehicleRoutes.js
// Purpose: Express router exposing vehicle endpoints


const express2 = require('express');
const router2 = express2.Router();
const vehicleController = require('../controllers/vehicleController');
const upload = require('../middlewares/upload');


// POST /api/vehicles
router2.post('/', upload.single('photo'), vehicleController.createVehicleHandler);

// GET /api/vehicles  -> list all vehicles
router2.get('/', vehicleController.getAllVehiclesHandler);

// GET /api/vehicles/owner/:ownerId
router2.get('/owner/:ownerId', vehicleController.listVehiclesByOwnerHandler);

// GET /api/vehicles/:id
router2.get('/:id', vehicleController.getVehicleHandler);

// GET /api/vehicles/owner/:ownerId
router2.get('/owner/:ownerId', vehicleController.listVehiclesByOwnerHandler);

// GET /api/vehicles/:id
router2.get('/:id', vehicleController.getVehicleHandler);

// PUT /api/vehicles/:id
router2.put('/:id', vehicleController.updateVehicleHandler);

// DELETE /api/vehicles/:id
router2.delete('/:id', vehicleController.deleteVehicleHandler);


// POST /api/vehicles/:id/photos
router2.post('/:id/photos', vehicleController.addPhotoHandler);


// DELETE /api/vehicles/photos/:photoId
router2.delete('/photos/:photoId', vehicleController.removePhotoHandler);


// PATCH /api/vehicles/:id/availability
router2.patch('/:id/availability', vehicleController.setAvailabilityHandler);


module.exports = router2;
