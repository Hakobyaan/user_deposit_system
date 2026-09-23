import { Router } from '../../types/module';
import { BadRequest } from '../../utils/errors';
import { authGuard } from './middleware';
import service from './service';

export const module: Router = {
  path:   '/transfer',
  routes: [
    {
      method:     'POST',
      path:       '/',
      middleware: [authGuard],
      handler:    async (req) => {
        const toUserId = Number(req.body?.toUserId);
        const amount = Number(req.body?.amount);
        if (!toUserId) throw new BadRequest('toUserId is required');
        if (!amount || amount <= 0) throw new BadRequest('amount must be a positive number');

        return service.transfer(req.authUserId!, toUserId, amount);
      },
    },
  ],
};
