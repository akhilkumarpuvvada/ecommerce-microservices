/**
 * PAYMENT SERVICE
 *
 * This service has NO REST endpoint for creating payments.
 * It is PURELY event-driven:
 *
 *   CONSUMES: order.created  → process the payment
 *   PRODUCES: payment.processed → tell others if it succeeded or failed
 *
 * This is the Saga pattern in action:
 *   Order Service starts the saga by publishing order.created
 *   Payment Service is one of the saga participants
 *
 * IDEMPOTENCY:
 *   Kafka delivers messages "at least once" — a message can arrive twice
 *   if a consumer crashes after processing but before committing the offset.
 *   We guard against this by checking if we already processed this orderId.
 */

const express = require('express');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;

const kafka = new Kafka({
  clientId: 'payment-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 10 },
});

const consumer = kafka.consumer({
  // Consumer Group ID — all instances of payment-service share this group.
  // Kafka ensures each message is processed by ONLY ONE instance in the group.
  // This is how you horizontally scale consumers safely.
  groupId: 'payment-service-group',
});

const producer = kafka.producer();

async function processPayment(orderEvent) {
  const { orderId, amount } = orderEvent;

  // ── IDEMPOTENCY CHECK ──────────────────────────────────────────
  // If we already processed this order, skip it.
  // This handles Kafka's "at-least-once" delivery guarantee.
  const existing = db.prepare('SELECT id FROM payments WHERE order_id = ?').get(orderId);
  if (existing) {
    console.log(`[Payment Service] Duplicate event ignored for orderId: ${orderId}`);
    return;
  }

  // ── SIMULATE PAYMENT PROCESSING ───────────────────────────────
  // In production: call Stripe/Braintree API here.
  // We simulate: orders over $1000 fail (e.g. card declined).
  const success = amount <= 1000;
  const status = success ? 'SUCCESS' : 'FAILED';

  // Save payment record to our private DB
  db.prepare(`
    INSERT INTO payments (id, order_id, amount, status)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), orderId, amount, status);

  console.log(`[Payment Service] Payment ${status} for orderId: ${orderId} | amount: $${amount}`);

  // ── PUBLISH RESULT EVENT ───────────────────────────────────────
  // We don't update the order directly — that would violate DB-per-service.
  // Instead, we publish the result and let Order Service update its own DB.
  await producer.send({
    topic: 'payment.processed',
    messages: [
      {
        key: orderId,
        value: JSON.stringify({
          orderId,
          status,         // 'SUCCESS' or 'FAILED'
          amount,
          processedAt: new Date().toISOString(),
        }),
        headers: { source: 'payment-service' },
      },
    ],
  });

  console.log(`[Payment Service] Event published → payment.processed | orderId: ${orderId} | ${status}`);
}

async function start() {
  await producer.connect();
  await consumer.connect();

  // Subscribe to order.created — this is what triggers payment processing
  await consumer.subscribe({ topic: 'order.created', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const event = JSON.parse(message.value.toString());
      console.log(`[Payment Service] Received event from topic: ${topic} | orderId: ${event.orderId}`);
      await processPayment(event);
    },
  });

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-service' }));
  app.listen(PORT, () => console.log(`[Payment Service] Running on port ${PORT}`));
}

start().catch((err) => {
  console.error('[Payment Service] Startup failed:', err);
  process.exit(1);
});
