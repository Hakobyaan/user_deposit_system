import Account from '../accounts/model';
import { Unauthorized } from '../../utils/errors';
import { signToken } from '../../utils/jwt';
const USERNAME_PATTERN = /^user(\d+)$/;

class AuthService {
  public async login(username: string, password: string) {
    const match = USERNAME_PATTERN.exec(username);
    if (!match || password !== username) {
      throw new Unauthorized('Invalid username or password');
    }

    const userId = Number(match[1]);
    const account = await Account.findOne({
      where: { userId }
    });
    if (!account) throw new Unauthorized('Invalid username or password');

    return {
      token: signToken({ userId }), userId
    };
  }
}

export default new AuthService();
