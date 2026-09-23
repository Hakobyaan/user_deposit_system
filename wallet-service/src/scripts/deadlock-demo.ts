/**
 * A single deposit only ever locks one account row, so the deposit flow
 * itself can never deadlock against another deposit — Postgres blocks the
 * second locker, it doesn't deadlock it. A real deadlock needs two
 * transactions to acquire two-or-more locks in opposite order, so this
 * script manufactures exactly that (locking accounts #1 and #2 in reverse
 * order on each side) purely to demonstrate that withDeadlockRetry recovers
 * from Postgres error 40P01 when it does happen elsewhere in the system.
 *
 * Run with: npm run demo:deadlock
 */
import { database, sequelize } from '../database';
import Account from '../modules/accounts/model';
import { withDeadlockRetry } from '../utils/withDeadlockRetry';
import logger from '../utils/logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function lockInOrder(firstId: number, secondId: number, label: string) {
  return withDeadlockRetry(() => sequelize.transaction(async (t) => {
    logger.info(`[${label}] locking account #${firstId}`);
    await Account.findOne({
      where: { userId: firstId }, transaction: t, lock: t.LOCK.UPDATE
    });
    await sleep(300); // widen the window so both sides are mid-transaction together
    logger.info(`[${label}] locking account #${secondId}`);
    await Account.findOne({
      where: { userId: secondId }, transaction: t, lock: t.LOCK.UPDATE
    });
    logger.info(`[${label}] committed`);
  }));
}

async function main() {
  await database.init();
  await Account.findOrCreate({
    where: { userId: 1 }, defaults: {
      userId: 1, balance: '0.00'
    }
  });
  await Account.findOrCreate({
    where: { userId: 2 }, defaults: {
      userId: 2, balance: '0.00'
    }
  });

  await Promise.all([
    lockInOrder(1, 2, 'T1'),
    lockInOrder(2, 1, 'T2'),
  ]);

  logger.info('Both transactions completed — one of them was deadlocked and retried automatically.');
  // eslint-disable-next-line no-process-exit
  process.exit(0);
}

main().catch((err) => {
  logger.error('Deadlock demo failed', err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
