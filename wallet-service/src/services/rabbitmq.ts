import amqplib, { Channel, ChannelModel } from 'amqplib';
import logger from '../utils/logger';
import { RABBITMQ_URL, DEPOSIT_EXCHANGE } from '../utils/variables';

class RabbitMQService {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  public async connect(): Promise<void> {
    if (this.channel) return;
    this.connection = await amqplib.connect(RABBITMQ_URL);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(DEPOSIT_EXCHANGE, 'topic', {
      durable: true
    });

    this.connection.on('error', (err) => logger.error('RabbitMQ connection error', err));
    this.connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      this.channel = null;
      this.connection = null;
    });

    logger.info('Connected to RabbitMQ');
  }

  public async publish(routingKey: string, payload: unknown): Promise<void> {
    if (!this.channel) await this.connect();
    this.channel!.publish(
      DEPOSIT_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        persistent: true, contentType: 'application/json'
      }
    );
  }
}

export default new RabbitMQService();
