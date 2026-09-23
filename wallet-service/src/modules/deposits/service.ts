import { Transaction as SequelizeTransaction } from 'sequelize';
import { sequelize } from '../../database';
import Account from '../accounts/model';
import TransactionModel from '../transactions/model';
import { NotFound } from '../../utils/errors';
import { withDeadlockRetry } from '../../utils/withDeadlockRetry';
import rabbitmq from '../../services/rabbitmq';
import logger from '../../utils/logger';
import { DEPOSIT_ROUTING_KEY } from '../../utils/variables';

class DepositService {
  public async deposit(userId: number, amount: number) {
    const result = await withDeadlockRetry(() => sequelize.transaction(
      // REPEATABLE READ: SELECT ... FOR UPDATE already serializes writers on
      // this row (that alone prevents the classic lost-update race), but
      // REPEATABLE READ additionally freezes this transaction's own view of
      // the row for its whole duration — no other statement in this same
      // transaction can see a different balance mid-flight, which matters
      // once more reads/checks (e.g. daily limits) get added around the
      // update. READ COMMITTED would be fine for this single UPDATE alone;
      // REPEATABLE READ is the cheap insurance for what this transaction
      // will likely grow into.
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

        const newBalance = (Number(account.balance) + amount).toFixed(2);

        // 2-table ACID update: both writes share transaction `t`, so a
        // failure on either one rolls back both.
        await account.update({
          balance: newBalance
        }, {
          transaction: t
        });
        const transaction = await TransactionModel.create({
          userId,
          amount:       amount.toFixed(2),
          type:         'deposit',
          balanceAfter: newBalance,
        }, {
          transaction: t
        });

        return {
          transaction, balance: newBalance
        };
      }
    ));

    // The deposit has already committed — a notification hiccup must never
    // undo it, so this is logged, not thrown.
    rabbitmq.publish(DEPOSIT_ROUTING_KEY, {
      userId,
      amount,
      balance:       result.balance,
      transactionId: result.transaction.id,
      occurredAt:    new Date().toISOString(),
    }).catch((err) => logger.error('Failed to publish deposit.created', err));

    return result;
  }
}

export default new DepositService();
