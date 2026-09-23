import { Pool } from 'pg';
import { PG_HOST, PG_PORT, PG_USER, PG_PASS, PG_DATABASE } from '../utils/variables';

/**
 * A raw pg Pool, used only where Sequelize's buffered result sets would
 * defeat the point — the CSV export needs a real server-side cursor
 * streamed in chunks, not a fully materialized array in memory.
 */
export const pgPool = new Pool({
  host:     PG_HOST,
  port:     PG_PORT,
  user:     PG_USER,
  password: PG_PASS,
  database: PG_DATABASE,
});
