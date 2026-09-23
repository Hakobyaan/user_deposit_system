import { Transaction as SequelizeTransaction } from 'sequelize';
import { sequelize } from '../../database';
import Account from '../accounts/model';
import TransactionModel from '../transactions/model';
import { BadRequest, NotFound } from '../../utils/errors';
import { withDeadlockRetry } from '../../utils/withDeadlockRetry';

class TransferService {
  public async transfer(fromUserId: number, toUserId: number, amount: number) {
    if (fromUserId === toUserId) throw new BadRequest('Cannot transfer to your own account');

    // Lock both accounts in a fixed order (ascending userId) regardless of
    // transfer direction — two transfers moving money in opposite
    // directions between the same pair of accounts would otherwise lock
    // rows in opposite order and deadlock. withDeadlockRetry is still the
    // backstop for any deadlock Postgres detects anyway.
    const [firstId, secondId] = [fromUserId, toUserId].sort((a, b) => a - b);

    return withDeadlockRetry(() => sequelize.transaction(
      {
        isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.REPEATABLE_READ
      },
      async (t) => {
        const first = await Account.findOne({
          where: { userId: firstId }, transaction: t, lock: t.LOCK.UPDATE
        });
        const second = await Account.findOne({
          where: { userId: secondId }, transaction: t, lock: t.LOCK.UPDATE
        });

        const fromAccount = firstId === fromUserId ? first : second;
        const toAccount = firstId === fromUserId ? second : first;

        if (!fromAccount) throw new NotFound(`No account found for userId ${fromUserId}`);
        if (!toAccount) throw new NotFound(`No account found for userId ${toUserId}`);
        if (Number(fromAccount.balance) < amount) throw new BadRequest('Insufficient balance');

        const fromBalance = (Number(fromAccount.balance) - amount).toFixed(2);
        const toBalance = (Number(toAccount.balance) + amount).toFixed(2);

        await fromAccount.update({
          balance: fromBalance
        }, {
          transaction: t
        });
        await toAccount.update({
          balance: toBalance
        }, {
          transaction: t
        });

        const [outTransaction] = await Promise.all([
          TransactionModel.create({
            userId: fromUserId, amount: amount.toFixed(2), type: 'transfer_out', balanceAfter: fromBalance
          }, {
            transaction: t
          }),
          TransactionModel.create({
            userId: toUserId, amount: amount.toFixed(2), type: 'transfer_in', balanceAfter: toBalance
          }, {
            transaction: t
          }),
        ]);

        return {
          transactionId: outTransaction.id, fromUserId, toUserId, amount, fromBalance, toBalance
        };
      }
    ));
  }
}

export default new TransferService();
