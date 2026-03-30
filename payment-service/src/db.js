/**
 * DATABASE — Payment Service (its own private DB)
 *
 * Stores payment records — completely separate from orders DB.
 * Order Service cannot query this table. Ever.
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../payments.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id           TEXT PRIMARY KEY,
    order_id     TEXT NOT NULL UNIQUE,
    amount       REAL NOT NULL,
    status       TEXT NOT NULL,  -- SUCCESS | FAILED
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

module.exports = db;
