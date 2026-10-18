import redis from '../../services/redis';

export interface ReportRecord {
  status: 'processing' | 'done' | 'error';
  path?: string;
  message?: string;
}

const reportKey = (reportId: string) => `report:${reportId}`;


export class ReportRepository {
  public setStatus(reportId: string, record: ReportRecord) {
    return redis.set<ReportRecord>(reportKey(reportId), record);
  }

  public getStatus(reportId: string) {
    return redis.get<ReportRecord>(reportKey(reportId));
  }
}
