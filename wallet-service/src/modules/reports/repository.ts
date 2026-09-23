import redis from '../../services/redis';

export interface ReportRecord {
  status: 'processing' | 'done' | 'error';
  path?: string;
  message?: string;
}

const reportKey = (reportId: string) => `report:${reportId}`;

/**
 * Redis-backed data access for report status/results — the reports
 * equivalent of a Sequelize-backed CoreRepository, just against Redis
 * instead of Postgres (see model.ts for why there's no table here).
 */
export class ReportRepository {
  public setStatus(reportId: string, record: ReportRecord) {
    return redis.set<ReportRecord>(reportKey(reportId), record);
  }

  public getStatus(reportId: string) {
    return redis.get<ReportRecord>(reportKey(reportId));
  }
}
