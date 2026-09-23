import QueryStream from 'pg-query-stream';
import { Router } from '../../types/module';
import { BadRequest } from '../../utils/errors';
import service from './service';
import { pgPool } from '../../services/pgPool';
import { CsvTransform } from '../../utils/csvTransform';
import logger from '../../utils/logger';

export const module: Router = {
  routes: [
    {
      method:  'GET',
      path:    '/:userId',
      handler: async ({ params, query }) => {
        const userId = Number(params.userId);
        if (!userId) throw new BadRequest('userId must be a number');
        const page = Number(query.page ?? 1);
        const limit = Number(query.limit ?? 20);
        return service.getHistory(userId, page, limit);
      },
    },
    {
      method:  'GET',
      path:    '/:userId/export',
      handler: async (req, res) => {
        const userId = Number(req.params.userId);
        if (!userId) throw new BadRequest('userId must be a number');

        const client = await pgPool.connect();
        const queryStream = new QueryStream(
          `SELECT id, user_id, amount, type, balance_after, created_at
             FROM transactions
            WHERE user_id = $1
            ORDER BY created_at DESC`,
          [userId],
          {
            batchSize: 500
          }
        );

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="transactions-${userId}.csv"`);

        const dbStream = client.query(queryStream);
        const csv = new CsvTransform();

        // The handler's promise only resolves once the HTTP response has
        // actually finished (or the client disconnected), so the generic
        // response wrapper — which checks res.headersSent right after
        // awaiting this handler — never races the still-streaming body.
        await new Promise<void>((resolve) => {
          let released = false;
          const cleanup = () => {
            if (released) return;
            released = true;
            client.release();
          };

          dbStream.on('error', (err: Error) => {
            logger.error('CSV export query stream failed', err);
            cleanup();
            if (!res.headersSent) res.status(500);
            res.end();
            resolve();
          });
          csv.on('error', cleanup);

          res.once('finish', () => {
            cleanup();
            resolve();
          });
          // Client aborted mid-download — stop reading from Postgres
          // immediately instead of draining the whole table into a void.
          res.once('close', () => {
            dbStream.destroy();
            cleanup();
            resolve();
          });

          // pipe()'d chain: when res.write() returns false, the pipe pauses
          // csv, which pauses dbStream, which stops issuing FETCH batches
          // against the cursor — backpressure propagates end-to-end with
          // no unbounded buffering anywhere in the chain.
          dbStream.pipe(csv).pipe(res);
        });
      },
    },
  ],
};
