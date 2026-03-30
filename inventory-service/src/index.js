/**
 * INVENTORY SERVICE
 *
 * CONSUMES: order.created       → reserve stock
 * CONSUMES: order.failed        → release reserved stock (compensating transaction)
 * PRODUCES: inventory.reserved  → tells order-service if stock was available
 *
 * The compensating transaction (releasing stock on order failure) is what
 * makes this a Saga participant. Without it, failed orders would permanently
 * lock stock that never gets sold.
 */

const express = require('express');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3003;

const kafka = new Kafka({
  clientId: 'inventory-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 10 },
});

const consumer = kafka.consumer({ groupId: 'inventory-service-group' });
const producer = kafka.producer();

// ── RESERVE STOCK ──────────────────────────────────────────────────────
async function reserveInventory(event) {
  const { orderId, productId, quantity } = event;

  // Idempotency: skip if already processed
  const existing = db.prepare('SELECT id FROM reservations WHERE order_id = ?').get(orderId);
  if (existing) {
    console.log(`[Inventory Service] Duplicate event ignored for orderId: ${orderId}`);
    return;
  }

  // Check stock availability
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

  let reservationStatus;

  if (!product || product.stock < quantity) {
    // Not enough stock — saga will eventually fail this order
    reservationStatus = 'INSUFFICIENT';
    console.log(`[Inventory Service] Insufficient stock for product: ${productId} | requested: ${quantity} | available: ${product?.stock ?? 0}`);
  } else {
    // Deduct stock and record reservation
    // We use a DB transaction so deduct + record is atomic
    db.transaction(() => {
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(quantity, productId);
      db.prepare('INSERT INTO reservations (id, order_id, product_id, quantity, status) VALUES (?, ?, ?, ?, ?)').run(
        uuidv4(), orderId, productId, quantity, 'RESERVED'
      );
    })();
    reservationStatus = 'RESERVED';
    console.log(`[Inventory Service] Stock reserved for orderId: ${orderId} | product: ${productId} | qty: ${quantity}`);
  }

  // Publish result — order-service will use this to complete or fail the saga
  await producer.send({
    topic: 'inventory.reserved',
    messages: [
      {
        key: orderId,
        value: JSON.stringify({
          orderId,
          productId,
          quantity,
          status: reservationStatus,   // 'RESERVED' or 'INSUFFICIENT'
          reservedAt: new Date().toISOString(),
        }),
        headers: { source: 'inventory-service' },
      },
    ],
  });

  console.log(`[Inventory Service] Event published → inventory.reserved | orderId: ${orderId} | ${reservationStatus}`);
}

// ── COMPENSATING TRANSACTION: Release stock if order failed ────────────
async function releaseInventory(event) {
  const { orderId } = event;

  const reservation = db.prepare("SELECT * FROM reservations WHERE order_id = ? AND status = 'RESERVED'").get(orderId);
  if (!reservation) return; // Nothing to release

  db.transaction(() => {
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(reservation.quantity, reservation.product_id);
    db.prepare("UPDATE reservations SET status = 'RELEASED' WHERE order_id = ?").run(orderId);
  })();

  console.log(`[Inventory Service] Stock released (compensating tx) for orderId: ${orderId} | qty: ${reservation.quantity}`);
}

async function start() {
  await producer.connect();
  await consumer.connect();

  // Subscribe to both topics
  await consumer.subscribe({ topics: ['order.created', 'order.failed'], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const event = JSON.parse(message.value.toString());
      if (topic === 'order.created') {
        await reserveInventory(event);
      } else if (topic === 'order.failed') {
        await releaseInventory(event);
      }
    },
  });

  // REST endpoint to check stock levels (read-only, for monitoring)
  app.get('/inventory', (req, res) => {
    const products = db.prepare('SELECT * FROM products').all();
    res.json(products);
  });

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'inventory-service' }));
  app.listen(PORT, () => console.log(`[Inventory Service] Running on port ${PORT}`));
}

start().catch((err) => {
  console.error('[Inventory Service] Startup failed:', err);
  process.exit(1);
});
