/**
 * ORDER SERVICE
 *
 * Responsibilities:
 *  - Accept order creation requests from API Gateway
 *  - Save order to its own database
 *  - Publish 'order.created' event to Kafka
 *  - Run Saga consumer: listen for payment + inventory results to confirm/fail orders
 */

const express = require('express');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { connectProducer, publishEvent } = require('./kafka');
const { startSagaConsumer } = require('./sagaConsumer');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(morgan('dev'));

// ─────────────────────────────────────────────
// POST /orders — Create a new order
// ─────────────────────────────────────────────
app.post('/orders', async (req, res) => {
  const { customer_id, product_id, quantity, amount } = req.body;

  // Basic validation
  if (!customer_id || !product_id || !quantity || !amount) {
    return res.status(400).json({
      error: 'customer_id, product_id, quantity, amount are required',
    });
  }

  const order = {
    id: uuidv4(),
    customer_id,
    product_id,
    quantity,
    amount,
    status: 'PENDING',
  };

  // Save to our private database
  db.prepare(`
    INSERT INTO orders (id, customer_id, product_id, quantity, amount, status)
    VALUES (@id, @customer_id, @product_id, @quantity, @amount, @status)
  `).run(order);

  console.log(`[Order Service] Order created: ${order.id} | status: PENDING`);

  // ─────────────────────────────────────────────────────────────────
  // PUBLISH EVENT to Kafka
  //
  // This is the core of event-driven architecture.
  // We don't call payment-service or inventory-service directly.
  // We just announce: "an order was created" — anyone who cares will react.
  //
  // Benefits:
  //  - Order service doesn't need to know who handles payment/inventory
  //  - If payment-service is down, the event waits in Kafka (durable)
  //  - Adding a new service (e.g. fraud detection) = just subscribe, no code change here
  // ─────────────────────────────────────────────────────────────────
  await publishEvent('order.created', {
    orderId:    order.id,
    customerId: order.customer_id,
    productId:  order.product_id,
    quantity:   order.quantity,
    amount:     order.amount,
  });

  res.status(201).json(order);
});

// ─────────────────────────────────────────────
// GET /orders/:id — Get order by ID
// ─────────────────────────────────────────────
app.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json(order);
});

// ─────────────────────────────────────────────
// GET /orders — List all orders
// ─────────────────────────────────────────────
app.get('/orders', (_req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(orders);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

// Connect Kafka producer first, then start HTTP server
// We wait for Kafka to be ready before accepting requests
// Start Kafka producer + saga consumer, then open HTTP server
Promise.all([connectProducer(), startSagaConsumer()])
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[Order Service] Running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[Order Service] Failed to start:', err);
    process.exit(1);
  });
