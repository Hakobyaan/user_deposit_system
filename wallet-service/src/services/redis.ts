import { createClient } from 'redis';
import logger from '../utils/logger';
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from '../utils/variables';

class RedisService {
  public client = createClient({
    password: REDIS_PASSWORD || undefined,
    socket:   {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
  });

  private connected = false;

  constructor() {
    this.client.on('error', (err) => logger.error('Redis Client Error', err));
  }

  public async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
    logger.info('Connected to Redis');
  }

  public async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  public async set<T>(key: string, value: T): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }

  public async setWithTTL<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), {
      EX: ttlSeconds
    });
  }

  /** Atomically claims `key` if it doesn't exist yet. Returns true if this call won the claim. */
  public async setNXWithTTL(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, {
      NX: true, EX: ttlSeconds
    });
    return result === 'OK';
  }

  public async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Atomic fixed-window counter: INCR then EXPIRE only on the first hit in the window. */
  public async incrWithWindow(key: string, windowSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return count;
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
  }
}

export default new RedisService();
