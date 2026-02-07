// Purpose: Connect to MySQL using mysql2 (no ORM, raw queries)

// Load environment variables
require('dotenv').config();

// Import mysql2, which provides both callback and promise APIs
const mysql = require('mysql2/promise');

// Create a connection pool (recommended for real-world apps)
// Pool lets multiple queries run without opening new connections each time
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'boanifxmofb2rkecbnqh-mysql.services.clever-cloud.com',   // MySQL host
  user: process.env.DB_USER || 'ubjrshmnpaaod7f2',        // username
  password: process.env.DB_PASS || 'Hr1DQl5N3tKUdwpFNque',        // password
  database: process.env.DB_NAME || 'boanifxmofb2rkecbnqh', // database name
  waitForConnections: true,                   // wait rather than error if busy
  connectionLimit: 10,                        // max simultaneous connections
  queueLimit: 0                               // unlimited queued requests
});

// A small test function to verify connectivity at startup
async function testConnection() {
  try {
    const connection = await pool.getConnection(); // try to get a connection
    console.log('✅ MySQL connected successfully');
    connection.release(); // release connection back to pool
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
}

// Export both pool (for queries) and testConnection (for startup check)
module.exports = { pool, testConnection };
