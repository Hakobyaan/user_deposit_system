import { Transaction as SequelizeTransaction } from 'sequelize';
import { sequelize } from '../../database';
import Account from '../accounts/model';
import TransactionModel from '../transactions/model';
import { BadRequest, NotFound } from '../../utils/errors';
import { withDeadlockRetry } from '../../utils/withDeadlockRetry';
import { faultPoint, trace } from '../../utils/trace';

class TransferService {
  public async transfer(fromUserId: number, toUserId: number, amount: number) {
    const users = [fromUserId, toUserId];
    const label = `user${fromUserId} → user${toUserId} $${amount.toFixed(2)}`;

    if (fromUserId === toUserId) {
      trace('warn', 'transfer.rejected', `${label}: cannot transfer to your own account`, { users });
      throw new BadRequest('Cannot transfer to your own account');
    }

    const [firstId, secondId] = [fromUserId, toUserId].sort((a, b) => a - b);
    trace('info', 'transfer.begin', `BEGIN transfer ${label}`, { users, data: { amount } });

    let inTransactionId: number | undefined;
    try {
      const result = await withDeadlockRetry(() => sequelize.transaction(
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
          trace('info', 'transfer.lock', `Locked accounts in order user${firstId}, user${secondId} (FOR UPDATE)`, { users });

          const fromAccount = firstId === fromUserId ? first : second;
          const toAccount = firstId === fromUserId ? second : first;

          if (!fromAccount) throw new NotFound(`No account found for userId ${fromUserId}`);
          if (!toAccount) throw new NotFound(`No account found for userId ${toUserId}`);
          if (Number(fromAccount.balance) < amount) throw new BadRequest('Insufficient balance');

          const fromBefore = fromAccount.balance;
          const toBefore = toAccount.balance;
          const fromBalance = (Number(fromAccount.balance) - amount).toFixed(2);
          const toBalance = (Number(toAccount.balance) + amount).toFixed(2);

          await fromAccount.update({
            balance: fromBalance
          }, {
            transaction: t
          });
          trace('info', 'transfer.debit', `Debit user${fromUserId}: ${fromBefore} → ${fromBalance}`, {
            users: [fromUserId], data: { balance: fromBalance }
          });
          faultPoint('transfer.after-debit');

          await toAccount.update({
            balance: toBalance
          }, {
            transaction: t
          });
          trace('info', 'transfer.credit', `Credit user${toUserId}: ${toBefore} → ${toBalance}`, {
            users: [toUserId], data: { balance: toBalance }
          });
          faultPoint('transfer.after-credit');

          const [outTransaction, inTransaction] = await Promise.all([
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
          trace('info', 'transfer.rows', `Inserted transfer_out #${outTransaction.id} (user${fromUserId}) and transfer_in #${inTransaction.id} (user${toUserId})`, {
            users, data: { outId: outTransaction.id, inId: inTransaction.id }
          });
          faultPoint('transfer.before-commit');
          inTransactionId = inTransaction.id;

          return {
            transactionId: outTransaction.id, fromUserId, toUserId, amount, fromBalance, toBalance
          };
        }
      ));

      trace('success', 'transfer.commit', `COMMIT ${label} — user${fromUserId}=${result.fromBalance}, user${toUserId}=${result.toBalance}`, {
        users, data: { ...result, inTransactionId }
      });
      return result;
    } catch (err) {
      trace('error', 'transfer.rollback', `ROLLBACK ${label}: ${(err as Error).message}`, { users });
      throw err;
    }
  }
}

export default new TransferService();
