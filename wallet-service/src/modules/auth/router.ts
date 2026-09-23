import { Router } from '../../types/module';
import { BadRequest } from '../../utils/errors';
import service from './service';

export const module: Router = {
  path:   '/auth',
  routes: [
    {
      method:  'POST',
      path:    '/login',
      handler: async (req) => {
        const { username, password } = req.body ?? {};
        if (!username || !password) throw new BadRequest('username and password are required');

        return service.login(String(username), String(password));
      },
    },
  ],
};
