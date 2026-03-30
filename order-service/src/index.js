/**
 * ORDER SERVICE
 *
 * Responsibilities:
 *  - Accept order creation requests from API Gateway
 *  - Save order to its own database
 *  - (Next commit) Publish 'order.created' event to Kafka
 *  - (Later) Listen for payment + inventory results to complete the Saga
 */

const express = require('express');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(morgan('dev'));

// ─────────────────────────────────────────────
// POST /orders — Create a new order
// ─────────────────────────────────────────────
app.post('/orders', (req, res) => {
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

  // TODO (next commit): publish order.created event to Kafka
  // So payment-service and inventory-service can start their work

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
app.get('/orders', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(orders);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

app.listen(PORT, () => {
  console.log(`[Order Service] Running on port ${PORT}`);
});
