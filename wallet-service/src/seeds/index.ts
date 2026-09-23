import { database } from '../database';
import Account from '../modules/accounts/model';
import logger from '../utils/logger';

const DEMO_USER_IDS = [1, 2, 3, 4, 5];

async function seed() {
  await database.init();

  for (const userId of DEMO_USER_IDS) {
    const [account, created] = await Account.findOrCreate({
      where:    { userId },
      defaults: {
        userId, balance: '0.00'
      },
    });
    logger.info(`${created ? 'Created' : 'Already exists'}: account for userId=${userId} (balance=${account.balance})`);
  }

  // eslint-disable-next-line no-process-exit
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed failed', err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
