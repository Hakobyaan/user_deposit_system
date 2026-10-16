import { CoreService } from '../../core/service';
import { TransactionRepository } from './repository';
import TransactionModel from './model';
import redis from '../../services/redis';
import { TRANSACTIONS_PAGE_CACHE_TTL_SECONDS } from '../../utils/variables';

const repository = new TransactionRepository(TransactionModel);

const firstPageCacheKey = (userId: number, limit: number) => `transactions:page1:${userId}:${limit}`;

class TransactionService extends CoreService<TransactionModel> {
  protected repository = repository;


  public async getHistory(userId: number, page: number, limit: number) {
    if (page === 1) {
      const cached = await redis.get<unknown>(firstPageCacheKey(userId, limit));
      if (cached) return cached;
    }

    const result = await this.repository.getAll({
      userId, page, limit
    });
    const payload = {
      total: result.count,
      page,
      limit,
      transactions: result.rows,
    };

    if (page === 1) {
      await redis.setWithTTL(firstPageCacheKey(userId, limit), payload, TRANSACTIONS_PAGE_CACHE_TTL_SECONDS);
    }

    return payload;
  }
}

export default new TransactionService(repository);
