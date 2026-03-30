/**
 * KAFKA CLIENT — Order Service
 *
 * KafkaJS is the Node.js Kafka client.
 *
 * Key concepts:
 *  - Producer: publishes messages to a Kafka topic
 *  - Consumer: subscribes to a topic and processes messages
 *  - Topic: a named channel (like a queue, but messages are retained)
 *  - Partition: topics are split into partitions for parallel processing
 *  - Consumer Group: multiple service instances sharing the work
 *
 * Order Service acts as a PRODUCER here.
 * It publishes events after state changes.
 */

const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  // Retry config — in prod Kafka might not be ready immediately on startup
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const producer = kafka.producer();

// Connect once on startup, reuse the connection for all publishes
async function connectProducer() {
  await producer.connect();
  console.log('[Order Service] Kafka producer connected');
}

/**
 * Publish an event to a Kafka topic.
 *
 * @param {string} topic   - e.g. 'order.created'
 * @param {object} payload - the event data (will be JSON serialized)
 *
 * WHY key = orderId?
 * Kafka routes messages with the same key to the same partition.
 * This guarantees all events for one order are processed IN ORDER.
 * Without a key, messages could go to any partition — order lost.
 */
async function publishEvent(topic, payload) {
  await producer.send({
    topic,
    messages: [
      {
        key: payload.orderId,          // same order → same partition → ordered
        value: JSON.stringify(payload), // Kafka messages are bytes — we use JSON
        headers: {
          eventType: topic,
          timestamp: String(Date.now()),
          source: 'order-service',
        },
      },
    ],
  });

  console.log(`[Order Service] Event published → topic: ${topic} | orderId: ${payload.orderId}`);
}

module.exports = { connectProducer, publishEvent };
