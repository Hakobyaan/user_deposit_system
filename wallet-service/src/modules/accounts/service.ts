import { CoreService } from '../../core/service';
import { AccountRepository } from './repository';
import Account from './model';

const repository = new AccountRepository(Account);

class AccountService extends CoreService<Account> {
  protected repository = repository;
}

export default new AccountService(repository);
