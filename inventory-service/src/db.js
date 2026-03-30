/**
 * DATABASE — Inventory Service
 *
 * Two tables:
 *  - products: the stock levels
 *  - reservations: tracks which orders reserved which stock
 *
 * Why track reservations separately?
 * If an order fails AFTER inventory was reserved, we need to RELEASE
 * that stock back. The reservations table lets us do that.
 * This is the "compensating transaction" in the Saga pattern.
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../inventory.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    stock    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id         TEXT PRIMARY KEY,
    order_id   TEXT NOT NULL UNIQUE,
    product_id TEXT NOT NULL,
    quantity   INTEGER NOT NULL,
    status     TEXT NOT NULL   -- RESERVED | RELEASED | INSUFFICIENT
  );
`);

// Seed some products so we have stock to work with
const existing = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (existing.count === 0) {
  db.prepare("INSERT INTO products (id, name, stock) VALUES ('prod-001', 'Laptop', 50)").run();
  db.prepare("INSERT INTO products (id, name, stock) VALUES ('prod-002', 'Phone', 100)").run();
  db.prepare("INSERT INTO products (id, name, stock) VALUES ('prod-003', 'Tablet', 30)").run();
  console.log('[Inventory Service] Seeded products table');
}

module.exports = db;
