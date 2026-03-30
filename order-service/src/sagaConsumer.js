/**
 * SAGA CONSUMER — Order Service
 *
 * This is the heart of the Choreography Saga.
 *
 * The order saga has 2 participants: payment-service and inventory-service.
 * Both run in PARALLEL after order.created is published.
 * Order Service waits for BOTH results before making a final decision.
 *
 * Decision logic:
 *   payment=SUCCESS  AND inventory=RESERVED   → order CONFIRMED
 *   payment=FAILED   OR  inventory=INSUFFICIENT → order FAILED
 *
 * When FAILED:
 *   - Order Service publishes order.failed
 *   - Inventory Service listens to order.failed and releases stock
 *   This is the "compensating transaction" that undoes partial work.
 *
 * WHY CHOREOGRAPHY (not Orchestration)?
 *   Orchestration: a central "saga orchestrator" tells each service what to do.
 *   Choreography: each service reacts to events independently, no central brain.
 *   Choreography is more resilient — no single point of failure.
 *   Orchestration is easier to reason about for complex flows.
 */

const { Kafka } = require('kafkajs');
const db = require('./db');
const { publishEvent } = require('./kafka');

// In-memory store for partial saga results.
// Key: orderId, Value: { payment?: result, inventory?: result }
//
// In production: use Redis or a DB table for this.
// In-memory works here because we have a single instance,
// but it would break if you scale order-service horizontally.
const sagaState = new Map();

const kafka = new Kafka({
  clientId: 'order-service-consumer',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 10 },
});

const consumer = kafka.consumer({ groupId: 'order-service-saga-group' });

async function evaluateSaga(orderId) {
  const state = sagaState.get(orderId);

  // Wait until we have results from BOTH participants
  if (!state || !state.payment || !state.inventory) {
    return; // Not all results in yet — wait
  }

  const paymentOk   = state.payment.status === 'SUCCESS';
  const inventoryOk = state.inventory.status === 'RESERVED';
  const finalStatus = (paymentOk && inventoryOk) ? 'CONFIRMED' : 'FAILED';

  // Update order status in our DB
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(finalStatus, orderId);

  console.log(`[Order Service] Saga completed for orderId: ${orderId} → ${finalStatus}`);
  console.log(`  payment: ${state.payment.status} | inventory: ${state.inventory.status}`);

  if (finalStatus === 'CONFIRMED') {
    // Happy path — notify the world the order is done
    await publishEvent('order.completed', {
      orderId,
      customerId: db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(orderId)?.customer_id,
      status: 'CONFIRMED',
    });
  } else {
    // Failed — publish order.failed so inventory-service can release stock
    await publishEvent('order.failed', {
      orderId,
      reason: !paymentOk ? 'payment_failed' : 'insufficient_inventory',
    });
  }

  // Cleanup saga state from memory
  sagaState.delete(orderId);
}

async function startSagaConsumer() {
  await consumer.connect();

  // Listen for results from both saga participants
  await consumer.subscribe({
    topics: ['payment.processed', 'inventory.reserved'],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const event = JSON.parse(message.value.toString());
      const { orderId } = event;

      // Initialize saga state for this order if first result arriving
      if (!sagaState.has(orderId)) {
        sagaState.set(orderId, {});
      }

      const state = sagaState.get(orderId);

      if (topic === 'payment.processed') {
        state.payment = { status: event.status };
        console.log(`[Order Service] Received payment result for ${orderId}: ${event.status}`);
      } else if (topic === 'inventory.reserved') {
        state.inventory = { status: event.status };
        console.log(`[Order Service] Received inventory result for ${orderId}: ${event.status}`);
      }

      // Try to evaluate — will no-op if we don't have both results yet
      await evaluateSaga(orderId);
    },
  });

  console.log('[Order Service] Saga consumer listening on payment.processed + inventory.reserved');
}

module.exports = { startSagaConsumer };
