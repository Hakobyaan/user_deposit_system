import { envVariable } from './helpers';

export const NODE_ENV = envVariable('NODE_ENV') as string;
export const EXTENSION = NODE_ENV === 'production' ? 'js' : 'ts';

export const PORT = envVariable('PORT', 'int') as number;
export const CLUSTER_WORKERS = process.env.CLUSTER_WORKERS
  ? Number(process.env.CLUSTER_WORKERS)
  : undefined;

export const PG_HOST = envVariable('PG_HOST') as string;
export const PG_PORT = envVariable('PG_PORT', 'int') as number;
export const PG_USER = envVariable('PG_USER') as string;
export const PG_PASS = process.env.PG_PASS ?? '';
export const PG_DATABASE = envVariable('PG_DATABASE') as string;
export const PG_LOGGER = process.env.PG_LOGGER === 'true';
export const PG_SYNCHRONIZE = process.env.PG_SYNCHRONIZE === 'true';

export const REDIS_HOST = envVariable('REDIS_HOST') as string;
export const REDIS_PORT = envVariable('REDIS_PORT', 'int') as number;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? '';

export const RABBITMQ_URL = envVariable('RABBITMQ_URL') as string;
export const DEPOSIT_EXCHANGE = process.env.DEPOSIT_EXCHANGE ?? 'deposit_exchange';
export const DEPOSIT_ROUTING_KEY = process.env.DEPOSIT_ROUTING_KEY ?? 'deposit.created';

export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 10);
export const RATE_LIMIT_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);

export const IDEMPOTENCY_LOCK_TTL_SECONDS = Number(process.env.IDEMPOTENCY_LOCK_TTL_SECONDS ?? 60);
export const IDEMPOTENCY_RESULT_TTL_SECONDS = Number(process.env.IDEMPOTENCY_RESULT_TTL_SECONDS ?? 86400);

export const TRANSACTIONS_PAGE_CACHE_TTL_SECONDS = Number(
  process.env.TRANSACTIONS_PAGE_CACHE_TTL_SECONDS ?? 30
);

export const REPORTS_DIR = process.env.REPORTS_DIR ?? './storage/reports';
