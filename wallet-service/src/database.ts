import { Sequelize } from 'sequelize';
import fs from 'node:fs';
import path from 'node:path';
import logger from './utils/logger';
import {
  PG_HOST, PG_PORT, PG_USER, PG_PASS, PG_DATABASE, PG_LOGGER, PG_SYNCHRONIZE, EXTENSION,
} from './utils/variables';

class Database {
  public connection: Sequelize;

  constructor() {
    this.connection = new Sequelize({
      host:     PG_HOST,
      port:     PG_PORT,
      username: PG_USER,
      password: PG_PASS,
      database: PG_DATABASE,
      dialect:  'postgres',
      logging:  PG_LOGGER,
    });
  }

  public async init({ sync }: { sync: boolean } = {
    sync: true
  }) {
    await this.connection.authenticate();
    await this.loadModels();
    await this.loadAssociations();

    if (sync) {
      await this.connection.sync({
        alter: PG_SYNCHRONIZE, force: false
      });
      await this.postSyncFixups();
      logger.info('Database schema synced');
    }

    logger.info('Database connected');
  }

  private async loadModels() {
    const modulesDir = `${__dirname}/modules`;
    const modules = fs.readdirSync(modulesDir).filter((x) => !x.includes('.'));
    // Not every module owns a table — deposits/reports are pure
    // business-logic modules that operate on other modules' models.
    modules
      .filter((moduleName) => fs.existsSync(path.join(modulesDir, moduleName, `model.${EXTENSION}`)))
      .forEach((moduleName) => {
        require(`${modulesDir}/${moduleName}/model`);
      });
    logger.info('Database models loaded');
  }

  private async loadAssociations() {
    require('./core/associations');
    logger.info('Database associations loaded');
  }

  /**
   * Sequelize's declarative sync() can create/alter columns but not CHECK
   * constraints, so the accounts.balance >= 0 consistency rule and the
   * transactions(user_id, created_at) composite index are applied as raw
   * SQL after sync. Both statements are idempotent no-ops on a second boot.
   */
  private async postSyncFixups() {
    const statements = [
      `ALTER TABLE accounts
         ADD CONSTRAINT balance_non_negative CHECK (balance >= 0)`,
      `CREATE INDEX IF NOT EXISTS idx_user_created
         ON transactions (user_id, created_at)`,
    ];

    for (const sql of statements) {
      try {
        await this.connection.query(sql);
      } catch (err) {
        const message = (err as Error)?.message ?? '';
        if (!message.includes('already exists')) {
          logger.warn(`[Database] postSyncFixups warning: ${message}`);
        }
      }
    }
  }
}

export const database = new Database();
export const sequelize = database.connection;
