import { Transaction as SequelizeTransaction } from 'sequelize';
import { sequelize } from '../../database';
import Account from '../accounts/model';
import TransactionModel from '../transactions/model';
import { NotFound } from '../../utils/errors';
import { withDeadlockRetry } from '../../utils/withDeadlockRetry';
import rabbitmq from '../../services/rabbitmq';
import logger from '../../utils/logger';
import { DEPOSIT_ROUTING_KEY } from '../../utils/variables';
import { faultPoint, trace } from '../../utils/trace';

class DepositService {
  public async deposit(userId: number, amount: number) {
    const users = [userId];
    const label = `user${userId} +$${amount.toFixed(2)}`;
    trace('info', 'deposit.begin', `BEGIN deposit ${label}`, { users, data: { amount } });

    const result = await withDeadlockRetry(() => sequelize.transaction(

      {
        isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.REPEATABLE_READ
      },
      async (t) => {
        const account = await Account.findOne({
          where:       { userId },
          transaction: t,
          lock:        t.LOCK.UPDATE, // SELECT ... FOR UPDATE
        });
        if (!account) throw new NotFound(`No account found for userId ${userId}`);
        trace('info', 'deposit.lock', `Locked account user${userId} (FOR UPDATE)`, { users });

        const before = account.balance;
        const newBalance = (Number(account.balance) + amount).toFixed(2);

        await account.update({
          balance: newBalance
        }, {
          transaction: t
        });
        trace('info', 'deposit.credit', `Credit user${userId}: ${before} → ${newBalance}`, { users, data: { balance: newBalance } });
        faultPoint('deposit.after-credit');

        const transaction = await TransactionModel.create({
          userId,
          amount:       amount.toFixed(2),
          type:         'deposit',
          balanceAfter: newBalance,
        }, {
          transaction: t
        });

        trace('info', 'deposit.row', `Inserted deposit #${transaction.id} (user${userId})`, { users, data: { id: transaction.id } });
        faultPoint('deposit.before-commit');

        return {
          transaction, balance: newBalance
        };
      }
    )).catch((err) => {
      trace('error', 'deposit.rollback', `ROLLBACK deposit ${label}: ${(err as Error).message}`, { users });
      throw err;
    });
    trace('success', 'deposit.commit', `COMMIT deposit ${label} — balance ${result.balance}`, {
      users, data: { transactionId: result.transaction.id, amount, balance: result.balance }
    });

    rabbitmq.publish(DEPOSIT_ROUTING_KEY, {
      userId,
      amount,
      balance:       result.balance,
      transactionId: result.transaction.id,
      occurredAt:    new Date().toISOString(),
    })
      .then(() => trace('info', 'rabbitmq.publish', `Published ${DEPOSIT_ROUTING_KEY} for deposit #${result.transaction.id}`, { users }))
      .catch((err) => {
        logger.error('Failed to publish deposit.created', err);
        trace('error', 'rabbitmq.publish', `Failed to publish ${DEPOSIT_ROUTING_KEY}: ${(err as Error).message}`, { users });
      });

    return result;
  }
}

export default new DepositService();
