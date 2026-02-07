# Online Car & Bike Rental Backend

Node.js + Express backend for an online car and bike rental platform. Provides customer, owner, vehicle, and admin APIs with MySQL storage and JWT auth.

## Stack
- Node.js, Express
- MySQL (`mysql2`)
- JWT auth
- Multer for uploads

## Setup
1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (example below).

3. Start the server:
```bash
npm run dev
```
or
```bash
npm start
```

Server starts at `http://localhost:8080` by default.

## Environment Variables
Create a `.env` file in the project root:
```env
PORT=8080
DB_NAME=online_rentals_db
DB_USER=root
DB_PASS=your_password
DB_HOST=localhost
DB_PORT=3306
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=7d
AADHAR_KEY=another_long_random_secret
VITE_API_URL=http://localhost:5000
```

## Scripts
- `npm run dev` - start with nodemon
- `npm start` - start with node

## API Overview
Base URL: `/api`

### Customers
- `POST /api/customers/signup` (multipart, `profile_picture`)
- `POST /api/customers/login`
- `GET /api/customers/:id` (JWT)
- `POST /api/customers/:id/kyc` (multipart, `aadhar_file`, `license_file`)
- `GET /api/customers/:id/kyc`
- `GET /api/customers/:id/bookings` (JWT)

### Owners
- `POST /api/owners/signup` (multipart, `profile_picture`)
- `POST /api/owners/login`
- `GET /api/owners/:ownerId`
- `PUT /api/owners/:ownerId` (multipart, `profile_picture`)
- `GET /api/owners/:ownerId/vehicles`
- `GET /api/owners/:ownerId/stats`
- `GET /api/owners/:ownerId/bookings`

### Vehicles
- `POST /api/vehicles` (multipart, `photo`)
- `GET /api/vehicles`
- `GET /api/vehicles/owner/:ownerId`
- `GET /api/vehicles/:id`
- `PUT /api/vehicles/:id`
- `DELETE /api/vehicles/:id`
- `POST /api/vehicles/:id/photos`
- `DELETE /api/vehicles/photos/:photoId`
- `PATCH /api/vehicles/:id/availability`

### Admins
- `POST /api/admins/login`
- `POST /api/admins/signup`
- `GET /api/admins/customers` (JWT)
- `GET /api/admins/customers/:id` (JWT)
- `PATCH /api/admins/customers/:id` (JWT)
- `DELETE /api/admins/customers/:id` (JWT)
- `GET /api/admins/owners` (JWT)
- `PATCH /api/admins/owners/:id` (JWT)
- `DELETE /api/admins/owners/:id` (JWT)
- `GET /api/admins/stats` (JWT)

## Uploads
Uploaded files are served from:
- `GET /uploads/...` mapped to `public/uploads`

## Notes
- MySQL connection is initialized on startup via `src/db/connection.js`.
- JWT middleware is in `src/middlewares/authMiddleware.js`.

