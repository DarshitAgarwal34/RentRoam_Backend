// File: src/index.js
// Purpose: entry point for the backend Express server for Online Car & Bike Rental

// Load environment variables from a .env file into process.env
require('dotenv').config();

const { pool, testConnection } = require('./db/connection');
testConnection(); // check DB at startup


// Import the Express framework to create the HTTP server
const express = require('express');

// Import CORS middleware so frontend (running on another port) can call this API
const cors = require('cors');

// Create an Express application instance
const app = express();

const path = require('path');

// Use JSON middleware so Express can parse JSON request bodies
app.use(express.json());

// Enable CORS with default settings (allows requests from any origin in dev)
app.use(cors());

const customerRoutes = require('./routes/customerRoutes.js');
const vehicleRoutes = require('./routes/vehicleRoutes.js');

app.use('/api/customers', customerRoutes);
app.use('/api/vehicles', vehicleRoutes);

const ownerRoutes = require('./routes/ownerRoutes');
app.use('/api/owners', ownerRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admins', adminRoutes);

// serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// A simple health-check route at the root path to verify the server runs
app.get('/', (req, res) => {
  // Send a small JSON response to confirm service is alive
  res.json({ status: 'ok', service: 'Online Rentals Backend' });
});

// Start the server on the port provided by environment or fallback to 5000
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  // Console log so you see server startup output during development
  console.log(`Server running on http://localhost:${PORT}`);
});
