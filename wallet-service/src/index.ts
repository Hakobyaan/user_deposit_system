import { config } from 'dotenv';
config();

import cluster from 'node:cluster';
import os from 'node:os';
import http from 'node:http';
import logger from './utils/logger';
import { PORT, CLUSTER_WORKERS } from './utils/variables';

async function startWorker(): Promise<void> {
  const server = (await import('./server')).default;
  const { database } = await import('./database');
  const redis = (await import('./services/redis')).default;
  const rabbitmq = (await import('./services/rabbitmq')).default;

  // Schema sync already ran once in the primary before any worker was
  // forked, so a worker only needs to load models/associations and open
  // its own connection pool — never alter the schema itself.
  await database.init({
    sync: false
  });
  await redis.connect();
  await rabbitmq.connect();
  await server.loadModules();

  http.createServer(server.server).listen(PORT, () => {
    logger.info(`Worker ${process.pid} listening on port ${PORT}`);
  });
}

async function runMigrationsThenFork(numWorkers: number): Promise<void> {
  const { database } = await import('./database');
  // Every cluster worker is a separate OS process that re-executes this
  // file from scratch, so `sequelize.sync({ alter: true })` running in each
  // of them concurrently races over the same ALTER/ADD CONSTRAINT
  // statements. Doing it once here, before any worker exists, avoids that.
  await database.init({
    sync: true
  });
  await database.connection.close();

  for (let i = 0; i < numWorkers; i += 1) cluster.fork();

  // Self-healing: a crashed worker never leaves the pool short-staffed.
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(
      `Worker ${worker.process.pid} exited (code=${code}, signal=${signal}). Forking a replacement.`
    );
    cluster.fork();
  });
}

const numWorkers = CLUSTER_WORKERS ?? os.cpus().length;

if (cluster.isPrimary) {
  logger.info(`Primary ${process.pid} starting ${numWorkers} worker process(es)`);

  runMigrationsThenFork(numWorkers).catch((err) => {
    logger.error('Primary failed to run migrations', err);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
} else {
  startWorker().catch((err) => {
    logger.error('Worker failed to start', err);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
}
