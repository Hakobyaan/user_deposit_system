import { Router } from '../../types/module';
import { NotFound } from '../../utils/errors';
import { authGuard } from './middleware';
import service from './service';
import Account from './model';

export const module: Router = {
  routes: [
    {
      method:     'GET',
      path:       '/me',
      middleware: [authGuard],
      handler:    async (req) => {
        const account = await service.getOne({
          userId: req.authUserId
        }) as Account | null;
        if (!account) throw new NotFound('Account not found');

        return {
          userId: account.userId, balance: account.balance
        };
      },
    },
  ],
};
