import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import logger from '../../utils/logger';
import { EXTENSION, REPORTS_DIR, PG_HOST, PG_PORT, PG_USER, PG_PASS, PG_DATABASE } from '../../utils/variables';
import { ReportRepository, ReportRecord } from './repository';

const repository = new ReportRepository();

class ReportService {

   public async generate(userId: number): Promise<string> {
    const reportId = uuid();
    await repository.setStatus(reportId, {
      status: 'processing'
    });

    const workerPath = path.join(__dirname, `worker.${EXTENSION}`);
    const worker = new Worker(workerPath, {
      workerData: {
        reportId,
        userId,
        reportsDir: REPORTS_DIR,
        pg:         {
          host: PG_HOST, port: PG_PORT, user: PG_USER, password: PG_PASS, database: PG_DATABASE
        },
      },
      execArgv: EXTENSION === 'ts' ? ['-r', 'ts-node/register'] : undefined,
    });

    worker.on('message', async (msg: { status: 'done' | 'error'; path?: string; message?: string }) => {
      if (msg.status === 'done') {
        await repository.setStatus(reportId, {
          status: 'done', path: msg.path
        });
      } else {
        await repository.setStatus(reportId, {
          status: 'error', message: msg.message
        });
      }
    });

    worker.on('error', async (err) => {
      logger.error(`Report worker crashed for reportId=${reportId}`, err);
      await repository.setStatus(reportId, {
        status: 'error', message: err.message
      });
    });

    return reportId;
  }

  public async getStatus(reportId: string): Promise<ReportRecord | null> {
    return repository.getStatus(reportId);
  }
}

export default new ReportService();
