import { Router } from '../../types/module';
import { BadRequest } from '../../utils/errors';
import { depositRateLimiter, idempotencyGuard, saveIdempotentResult, releaseIdempotencyClaim } from './middleware';
import service from './service';

export const module: Router = {
  path:   '/deposit',
  routes: [
    {
      method:     'POST',
      path:       '/',
      middleware: [depositRateLimiter, idempotencyGuard],
      handler:    async (req, res) => {
        const userId = Number(req.body?.userId);
        const amount = Number(req.body?.amount);
        if (!userId) throw new BadRequest('userId is required');
        if (!amount || amount <= 0) throw new BadRequest('amount must be a positive number');

        try {
          const { transaction, balance } = await service.deposit(userId, amount);
          const body = {
            ok:     true,
            status: 201,
            data:   {
              transactionId: transaction.id, userId, amount, balance
            },
          };
          await saveIdempotentResult(req.idempotencyKey!, 201, body);
          res.status(201).json(body);
        } catch (err) {
          await releaseIdempotencyClaim(req.idempotencyKey!);
          throw err;
        }
      },
    },
  ],
};
