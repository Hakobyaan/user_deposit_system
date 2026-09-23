import { CoreService } from '../../core/service';
import { TransactionRepository } from './repository';
import TransactionModel from './model';
import redis from '../../services/redis';
import { TRANSACTIONS_PAGE_CACHE_TTL_SECONDS } from '../../utils/variables';

const repository = new TransactionRepository(TransactionModel);

const firstPageCacheKey = (userId: number, limit: number) => `transactions:page1:${userId}:${limit}`;

class TransactionService extends CoreService<TransactionModel> {
  protected repository = repository;

  /**
   * Paginated history, sorted by created_at DESC. The WHERE user_id = ?
   * ORDER BY created_at DESC shape matches the leftmost prefix of
   * idx_user_created(user_id, created_at), so Postgres can serve this
   * straight off the index without a separate sort step.
   *
   * The first page is the overwhelmingly most-requested one (default view),
   * so it's the only one cached — cache-aside, 30s TTL, read-through.
   */
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
