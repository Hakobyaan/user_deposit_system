import { config } from 'dotenv';
config();

import amqplib, { ConsumeMessage } from 'amqplib';
import logger from './logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL as string;
const DEPOSIT_EXCHANGE = process.env.DEPOSIT_EXCHANGE ?? 'deposit_exchange';
const DEPOSIT_ROUTING_KEY = process.env.DEPOSIT_ROUTING_KEY ?? 'deposit.created';
const NOTIFICATION_QUEUE = process.env.NOTIFICATION_QUEUE ?? 'notification_queue';
const DEAD_LETTER_QUEUE = process.env.DEAD_LETTER_QUEUE ?? 'deposit_dlq';
const MAX_RETRY_ATTEMPTS = Number(process.env.MAX_RETRY_ATTEMPTS ?? 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS ?? 2000);
const SIMULATED_FAILURE_RATE = Number(process.env.SIMULATED_FAILURE_RATE ?? 0.2);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stands in for a real email provider call — logs, waits a second, and
 *  fails at random SIMULATED_FAILURE_RATE of the time so the retry/DLQ
 *  path in this file actually gets exercised. */
async function simulateSendEmail(payload: unknown): Promise<void> {
  logger.info(`Sending deposit notification email... ${JSON.stringify(payload)}`);
  await sleep(1000);
  if (Math.random() < SIMULATED_FAILURE_RATE) {
    throw new Error('Simulated email provider failure');
  }
  logger.info('Email sent successfully');
}

async function main() {
  const connection = await amqplib.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(DEPOSIT_EXCHANGE, 'topic', {
    durable: true
  });
  await channel.assertQueue(NOTIFICATION_QUEUE, {
    durable: true
  });
  await channel.bindQueue(NOTIFICATION_QUEUE, DEPOSIT_EXCHANGE, DEPOSIT_ROUTING_KEY);
  await channel.assertQueue(DEAD_LETTER_QUEUE, {
    durable: true
  });

  // Only one unacked message in flight at a time — makes the ack-only-on-
  // success guarantee (and the retry pacing) easy to reason about.
  await channel.prefetch(1);

  logger.info(`Waiting for '${DEPOSIT_ROUTING_KEY}' events on '${NOTIFICATION_QUEUE}'...`);

  channel.consume(NOTIFICATION_QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    const priorAttempts = Number(msg.properties.headers?.['x-retry-count'] ?? 0);
    const attemptNumber = priorAttempts + 1;

    try {
      const payload = JSON.parse(msg.content.toString());
      await simulateSendEmail(payload);
      // Acknowledge ONLY after the message is fully, successfully handled —
      // if this process crashes before this point, RabbitMQ redelivers it.
      channel.ack(msg);
    } catch (err) {
      logger.warn(`Attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS} failed: ${(err as Error).message}`);

      if (attemptNumber < MAX_RETRY_ATTEMPTS) {
        // Remove the original and republish a copy with the attempt count
        // stamped in, after a short delay — avoids both an unbounded
        // in-broker requeue loop and a hot retry with no backoff at all.
        channel.ack(msg);
        await sleep(RETRY_DELAY_MS);
        channel.sendToQueue(NOTIFICATION_QUEUE, msg.content, {
          persistent: true,
          headers:    {
            ...msg.properties.headers, 'x-retry-count': attemptNumber
          },
        });
      } else {
        logger.error(`Exhausted ${MAX_RETRY_ATTEMPTS} attempts — routing to ${DEAD_LETTER_QUEUE}`);
        channel.ack(msg);
        channel.sendToQueue(DEAD_LETTER_QUEUE, msg.content, {
          persistent: true, headers: msg.properties.headers
        });
      }
    }
  }, {
    noAck: false
  });

  connection.on('error', (err) => {
    logger.error('RabbitMQ connection error', err);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
  connection.on('close', () => {
    logger.error('RabbitMQ connection closed — exiting so the container/orchestrator restarts this process');
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error('Notification service failed to start', err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
