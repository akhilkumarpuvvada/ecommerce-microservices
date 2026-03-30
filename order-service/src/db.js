/**
 * DATABASE — Order Service
 *
 * KEY PRINCIPLE: Database per Service
 * Each microservice owns its own database.
 * NO other service can read or write this DB directly.
 * Other services get data only by calling our REST API or reading Kafka events.
 *
 * Why? If services share a DB:
 *  - One bad migration can break all services
 *  - Services become tightly coupled
 *  - You can't scale or deploy them independently
 *
 * Here we use SQLite (file-based) to keep setup zero.
 * In production: PostgreSQL, Aurora, etc.
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../orders.db'));

// Create orders table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    product_id  TEXT NOT NULL,
    quantity    INTEGER NOT NULL,
    amount      REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    -- ORDER STATUS MACHINE:
    -- PENDING   → order created, waiting for payment + inventory
    -- CONFIRMED → payment success AND inventory reserved
    -- FAILED    → payment failed OR inventory insufficient
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

module.exports = db;
