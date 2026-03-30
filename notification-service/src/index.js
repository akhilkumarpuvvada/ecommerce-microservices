/**
 * NOTIFICATION SERVICE
 *
 * The simplest saga participant — purely reactive, zero business logic.
 * It only CONSUMES events and sends notifications. It never publishes.
 *
 * CONSUMES: order.completed → "Your order is confirmed!"
 * CONSUMES: order.failed    → "Your order failed, you won't be charged."
 *
 * This is a great example of why event-driven architecture shines:
 * When we added notifications, we changed ZERO code in other services.
 * We just subscribed to existing events. That's open/closed principle in action.
 *
 * In production: integrate with SendGrid (email), Twilio (SMS), Firebase (push).
 * Here we simulate by logging — the pattern is identical.
 */

const express = require('express');
const { Kafka } = require('kafkajs');

const app = express();
const PORT = process.env.PORT || 3004;

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 10 },
});

const consumer = kafka.consumer({ groupId: 'notification-service-group' });

// Simulate sending a notification
function sendNotification(type, data) {
  const timestamp = new Date().toISOString();

  if (type === 'order.completed') {
    console.log(`[Notification Service] ✉  EMAIL SENT to customer: ${data.customerId}`);
    console.log(`  Subject: "Your order ${data.orderId} is confirmed!"`);
    console.log(`  Body: "Great news! Your order has been confirmed and is being processed."`);
    console.log(`  Sent at: ${timestamp}`);
  } else if (type === 'order.failed') {
    console.log(`[Notification Service] ✉  EMAIL SENT to customer: ${data.customerId || 'unknown'}`);
    console.log(`  Subject: "Your order ${data.orderId} could not be processed"`);
    console.log(`  Body: "We're sorry, your order failed due to: ${data.reason}. You have not been charged."`);
    console.log(`  Sent at: ${timestamp}`);
  }
}

async function start() {
  await consumer.connect();

  await consumer.subscribe({
    topics: ['order.completed', 'order.failed'],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const event = JSON.parse(message.value.toString());
      console.log(`[Notification Service] Received event: ${topic} | orderId: ${event.orderId}`);
      sendNotification(topic, event);
    },
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service' }));
  app.listen(PORT, () => console.log(`[Notification Service] Running on port ${PORT}`));
}

start().catch((err) => {
  console.error('[Notification Service] Startup failed:', err);
  process.exit(1);
});
