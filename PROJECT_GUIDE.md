# Ուղեցույց՝ ինչ որտեղ է և ինչպես թեստավորել

Սա ուղեկցող ֆայլ է [`README.md`](./README.md)-ին և [`ARCHITECTURE.md`](./ARCHITECTURE.md)-ին. Նպատակն է՝
1. Ցույց տալ, թե **ինչ ֆայլ ինչ դեր ունի** ամեն module-ում,
2. Տալ **քայլ առ քայլ թեստավորման սցենար**, որը կարող ես բառացի կրկնել հանձնելիս և բացատրել ամեն requirement-ի համար։

---

## 1. Module-ի structure-ը (wallet-service)

Ամեն `wallet-service/src/modules/<name>/` folder-ն ունի **նույն 5 ֆայլերը**, միշտ նույն դերով.

| Ֆայլ | Դեր |
|---|---|
| `router.ts` | HTTP routes (path, method, middleware, handler). Սա այն ֆայլն է, որ `server.ts`-ի auto-loader-ը փնտրում է ամեն module folder-ում։ |
| `service.ts` | Business logic — ինչ պիտի արվի (transaction, validation, cache, publish event ևն)։ Router-ը երբեք ուղիղ DB/Redis չի դիպչում, միշտ service-ի միջոցով։ |
| `repository.ts` | Data access layer — Sequelize model-ի (կամ Redis-ի) հետ աշխատանքի shim, ժառանգում է `core/repository.ts`-ի `CoreRepository`-ից։ |
| `model.ts` | Sequelize model (DB table-ի սահմանումը) — եթե module-ն ունի սեփական table։ |
| `middleware.ts` | Այս module-ի route-ներին հատուկ middleware-ները (rate limit, idempotency ևն)։ |

**Կարևոր նրբություն, որը պետք է կարողանաս բացատրել**՝ ոչ բոլոր module-ներն ունեն **սեփական** table կամ middleware, և դա design-ի սխալ չէ, այլ միտումնավոր decision.

| Module | model.ts | repository.ts | middleware.ts | Ինչու |
|---|---|---|---|---|
| `accounts` | Իրական `Account` model (`accounts` table) | Իրական `AccountRepository` | Placeholder (`export {}`) | Accounts-ը DB table ունի, բայց public endpoint չունի — միայն `deposits`-ն է դիպչում իրեն, locked transaction-ի ներսում։ |
| `transactions` | Իրական `TransactionModel` (`transactions` table) | Իրական `TransactionRepository` | Placeholder | Read-only GET endpoint-ներ են, middleware պետք չէ։ |
| `deposits` | Re-export է անում `Account`-ը և `TransactionModel`-ը | Re-export է անում `AccountRepository`-ն ու `TransactionRepository`-ն | Re-export է անում `depositRateLimiter` և `idempotencyGuard`-ը `core/`-ից | Deposit-ը **սեփական table չունի** — փոխում է `accounts.balance`-ը և գրում է նոր տող `transactions`-ում, երկուսն էլ մեկ Sequelize transaction-ի ներսում (`service.ts`-ում)։ Model/repository-ն duplicate անել կնշանակեր 2 տեղում սահմանել նույն table-ը՝ bug-երի աղբյուր։ |
| `reports` | Placeholder (`export {}`) | Իրական `ReportRepository`, բայց Redis-ի, ոչ թե Postgres-ի վրա | Placeholder | Report-ն ունի status, ոչ թե DB row — Worker Thread-ը `postMessage`-ով է հաղորդում, ուստի status-ը պահվում է Redis-ում (կիսվում է cluster-ի բոլոր worker-ների միջև)։ PDF-ի տվյալները `worker.ts`-ը հանում է raw `pg.Client`-ով, որովհետև worker thread-ը չի կարող կիսվել main thread-ի Sequelize connection pool-ի հետ։ |

Ինչու shared middleware-ները (`depositRateLimiter`, `idempotencyGuard`) ֆիզիկապես ապրում են `core/`-ում, ոչ թե module-ում. որովհետև դրանք **generic** են (կարող են կիրառվել ցանկացած endpoint-ի վրա), ոչ թե deposit-ին հատուկ տրամաբանություն։ `deposits/middleware.ts`-ը դրանք re-export է անում, որպեսզի `router.ts`-ը import անի local `./middleware`-ից, ոչ թե ուղիղ `../../core/...`-ից։

---

## 2. Ֆայլ առ ֆայլ ցուցակ (wallet-service)

```
wallet-service/src/
├── index.ts                     # Entry point. Cluster primary/worker տրամաբանություն.
│                                 #   Primary-ն 1 անգամ սինքրոնացնում է DB schema-ն, հետո fork
│                                 #   անում N worker process (os.cpus().length), crash-ից հետո
│                                 #   ավտոմատ refork.
├── server.ts                    # Express app + module auto-loader (կարդում է modules/*/router.ts)
│                                 #   ֆայլերը, կառուցում route-երը dynamic-ով։
├── database.ts                  # Sequelize connection, models/associations-ի բեռնում,
│                                 #   postSyncFixups() (CHECK constraint + composite index, որովհետև
│                                 #   sequelize.sync()-ը դրանք ինքնուրույն չի ստեղծում)։
│
├── core/                        # Shared/generic layer, ոչ մեկ module-ին հատուկ
│   ├── repository.ts            #   CoreRepository<M> — create/update/delete/getOne/getAll generic-ով
│   ├── service.ts               #   CoreService<M> — base class, ամեն module service-ը ժառանգում է
│   ├── idempotency.middleware.ts#   Idempotency-Key claim/replay Redis-ով (SET NX EX)
│   ├── rateLimiter.middleware.ts#   Fixed-window rate limit Redis-ով (INCR + EXPIRE)
│   └── associations.ts          #   Account ⇄ TransactionModel Sequelize relation-ները
│
├── modules/
│   ├── accounts/                # Account table (id, userId, balance). Ոչ մի public route.
│   ├── transactions/             # Transaction history: GET list (paginated+cached), GET export (CSV stream)
│   ├── deposits/                 # POST /deposit — idempotent, rate-limited, 2-table ACID transaction
│   └── reports/                  # POST generate / GET status / GET download — Worker Thread PDF
│       └── worker.ts             #   Worker Thread entry — ծանր հաշվարկ, ուղիղ pg.Client raw query
│
├── services/                    # Infrastructure client-ներ (ոչ business logic)
│   ├── pgPool.ts                #   Raw pg.Pool, միայն CSV export-ի cursor-ի համար
│   ├── redis.ts                 #   Redis client wrapper (get/set/incrWithWindow/setNXWithTTL)
│   └── rabbitmq.ts              #   RabbitMQ publish-only client (deposit_exchange)
│
├── utils/                       # Pure helpers՝ errors.ts (BadRequest/NotFound classes),
│                                 #   withDeadlockRetry.ts, csvTransform.ts, logger.ts, variables.ts (env)
│
├── scripts/deadlock-demo.ts     # Bonus՝ 2 parallel transaction, որ գիտակցաբար deadlock են անում,
│                                 #   ցույց տալու withDeadlockRetry-ի retry logic-ը
└── seeds/index.ts               # Demo account-ներ (userId 1-5, balance 0) ստեղծող script
```

```
notification-service/src/
├── index.ts     # RabbitMQ consumer. Consume → simulateSendEmail (20% fail rate) →
│                 #   success՝ ack; fail՝ retry մինչև 3 փորձ (x-retry-count header); 3-ից հետո → deposit_dlq
└── logger.ts     # Winston logger
```

---

## 3. Թեստավորման սցենար (defense-ի համար)

Նախ գործարկիր ամեն ինչը.

```bash
docker compose up --build
docker compose exec wallet-service node ./dist/seeds/index.js   # userId 1-5, balance 0
```

Ստուգիր, որ ամեն ինչ կանգնած է.

```bash
curl http://localhost:3000/health          # {"ok":true}
```

Ստորև՝ **ամեն requirement-ի** համար՝ ինչ հրամանով ցույց տալ, և ինչ ասել defense-ի ժամանակ։

### 3.1. Idempotency (կրկնակի deposit-ի կանխարգելում)

```bash
curl -X POST http://localhost:3000/deposit \
  -H "Content-Type: application/json" -H "Idempotency-Key: demo-1" \
  -d '{"userId": 1, "amount": 100}'
# նույն request-ը կրկին, նույն key-ով
curl -X POST http://localhost:3000/deposit \
  -H "Content-Type: application/json" -H "Idempotency-Key: demo-1" \
  -d '{"userId": 1, "amount": 100}'
```

**Ինչ ասել**՝ 2-րդ request-ը վերադարձնում է **նույն** cache-ավորված պատասխանը (նույն `transactionId`), balance-ը **չի ավելանում 2-րդ անգամ**։ Կոդը՝ [`core/idempotency.middleware.ts`](./wallet-service/src/core/idempotency.middleware.ts) — Redis `SET NX EX`-ով "claim" է անում key-ը; եթե key-ն արդեն կա, կամ վերադարձնում է cache-ավորված պատասխանը, կամ (եթե դեռ processing է) `409`։

### 3.2. Race condition / Row-level locking (2 parallel deposit նույն user-ին)

```bash
for i in 1 2; do
  curl -X POST http://localhost:3000/deposit \
    -H "Content-Type: application/json" -H "Idempotency-Key: race-$i" \
    -d '{"userId": 2, "amount": 50}' &
done
wait
curl http://localhost:3000/transactions/2
```

**Ինչ ասել**՝ Balance-ը ճիշտ կլինի (+100, ոչ lost update), որովհետև [`deposits/service.ts`](./wallet-service/src/modules/deposits/service.ts)-ը `SELECT ... FOR UPDATE`-ով lock է անում account row-ը (`lock: t.LOCK.UPDATE`) `REPEATABLE READ` isolation-ով։ 2-րդ request-ը սպասում է 1-ինի commit-ին, հետո տեսնում է թարմացված balance-ը։

### 3.3. ACID / 2-table atomicity

**Ինչ ասել** (կոդից, առանց ցույց տալու failure-ը manually)՝ `deposits/service.ts`-ում `account.update()`-ը և `TransactionModel.create()`-ը կատարվում են **նույն** `sequelize.transaction()`-ի (`t`) ներսում։ Եթե 2-րդ insert-ը fail լինի, ամբողջ transaction-ը rollback է լինում, balance-ը **չի** փոխվում։

### 3.4. Consistency constraint (`balance >= 0`)

```bash
docker compose exec postgres psql -U postgres -d wallet -c "\d accounts"
```

**Ինչ ասել**՝ `database.ts`-ի `postSyncFixups()`-ը raw SQL-ով ավելացնում է `CHECK (balance >= 0)` constraint, քանի որ Sequelize `sync()`-ը CHECK constraint-ներ ինքնուրույն չի ստեղծում։

### 3.5. RabbitMQ event → notification

Deposit արա (3.1-ի curl-ը) և նայիր notification-service-ի log-երին.

```bash
docker compose logs -f notification-service
```

**Ինչ ասել**՝ Deposit-ից հետո `deposits/service.ts`-ը publish է անում `deposit.created` event `deposit_exchange`-ին (fire-and-forget, `.catch`-ով logged, deposit-ը երբեք չի rollback լինում notification-ի պատճառով)։ `notification-service`-ը consume է անում, "ուղարկում" fake email, 20% fail rate-ով. fail-ի դեպքում retry մինչև 3 փորձ, հետո → `deposit_dlq`։ Ցույց տուր RabbitMQ management UI-ում (`http://localhost:15672`, guest/guest) `deposit_dlq` queue-ի մեջ message-ները։

### 3.6. Composite index + pagination + cache

```bash
curl "http://localhost:3000/transactions/1?page=1&limit=20"
curl "http://localhost:3000/transactions/1?page=1&limit=20"   # 2-րդ անգամ՝ Redis cache-ից
docker compose exec postgres psql -U postgres -d wallet -c \
  "EXPLAIN ANALYZE SELECT * FROM transactions WHERE user_id=1 ORDER BY created_at DESC LIMIT 20;"
```

**Ինչ ասել**՝ `EXPLAIN ANALYZE`-ում պիտի երևա `Index Scan using idx_user_created`, ոչ թե `Seq Scan`։ Առաջին էջը cache է արվում 30 վրկ TTL-ով ([`transactions/service.ts`](./wallet-service/src/modules/transactions/service.ts))՝ cache-aside pattern։

### 3.7. CSV export + streaming/backpressure

```bash
curl -OJ "http://localhost:3000/transactions/1/export"
```

**Ինչ ասել**՝ [`transactions/router.ts`](./wallet-service/src/modules/transactions/router.ts)-ը raw `pg-query-stream`-ով բացում է server-side cursor, pipe անում CSV transform-ի միջով ուղիղ HTTP response-ին (`.pipe().pipe()`)։ Ոչ մի պահ ամբողջ dataset-ը memory-ում չի պահվում. եթե client-ի download-ը դանդաղ է, `res.write()` վերադարձնում է `false`, ինչը pause է անում ամբողջ chain-ը մինչև cursor-ի `FETCH`-ը։

### 3.8. Worker Thread report generation

```bash
curl -X POST http://localhost:3000/reports/generate \
  -H "Content-Type: application/json" -d '{"userId": 1}'
# => { "data": { "reportId": "..." } }

curl http://localhost:3000/reports/<reportId>/status   # "processing", հետո՝ "done"
curl -OJ http://localhost:3000/reports/<reportId>/download
```

**Ինչ ասել**՝ Մինչ report-ը generate է լինում (~2-3 վրկ, CPU-bound loop `worker.ts`-ում), API-ն շարունակում է սպասարկել այլ requests (ցույց տուր՝ միևնույն ժամանակ `curl http://localhost:3000/health` կանչիր, կամ deposit արա) — սա հենց ապացուցում է, որ ծանր հաշվարկը **main thread-ը չի freeze անում**։ Status-ը պահվում է Redis-ում, ոչ in-memory Map, որովհետև cluster-ի ցանկացած worker պիտի կարողանա պատասխանել status հարցմանը, ոչ միայն նա, ով spawn է արել Worker Thread-ը։

### 3.9. Cluster self-healing

```bash
docker compose exec wallet-service ps aux | grep node
docker compose exec wallet-service kill -9 <worker-pid>
docker compose logs wallet-service --tail 20
curl http://localhost:3000/health   # պիտի աշխատի անընդհատ
```

**Ինչ ասել**՝ `index.ts`-ի `cluster.on('exit', ...)`-ը ավտոմատ `cluster.fork()` է անում, log-երում կերևա "Forking a replacement"-ը, և `/health`-ը ամբողջ ընթացքում շարունակում է պատասխանել (մյուս worker-ները սպասարկում են trafic-ը)։

### 3.10. Rate limiting

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/deposit \
    -H "Content-Type: application/json" -H "Idempotency-Key: rl-$i" \
    -d '{"userId": 3, "amount": 1}'
done
```

**Ինչ ասել**՝ Առաջին 10-ը `201` են, 11-րդը՝ `429`։ [`core/rateLimiter.middleware.ts`](./wallet-service/src/core/rateLimiter.middleware.ts)-ը Redis `INCR` + `EXPIRE` fixed-window-ով, per-`userId`, per-րոպե։

### 3.11. Deadlock retry (bonus)

```bash
cd wallet-service && npm run demo:deadlock
```

**Ինչ ասել**՝ Script-ը գիտակցաբար 2 parallel transaction է սարքում, որոնք 2 account row lock են վերցնում **հակառակ հերթականությամբ** (classic deadlock setup)։ Postgres-ը հայտնաբերում է deadlock-ը (`40P01` error code), ընտրում մի victim-ի, abort է անում։ [`utils/withDeadlockRetry.ts`](./wallet-service/src/utils/withDeadlockRetry.ts)-ը բռնում է հենց այդ error code-ը և retry է անում abort եղած transaction-ը backoff-ով։ Log-երում կերևա՝ մեկը fail/retry/success, մյուսը՝ ուղիղ success։

---

## 4. Ընդհանուր "map" պատասխանելու համար

Եթե հարցնեն **"որտե՞ղ է X-ը իրականացված"**.

| Assignment-ի թեմա | Ֆայլ |
|---|---|
| Idempotency | `core/idempotency.middleware.ts`, `modules/deposits/middleware.ts` (re-export) |
| Isolation Level / Locking | `modules/deposits/service.ts` |
| ACID 2-table transaction | `modules/deposits/service.ts` |
| CHECK constraint | `database.ts` → `postSyncFixups()` |
| RabbitMQ publish | `modules/deposits/service.ts` → `services/rabbitmq.ts` |
| RabbitMQ consume / retry / DLQ | `notification-service/src/index.ts` |
| Composite index | `database.ts` → `postSyncFixups()`, օգտագործվում է `modules/transactions/service.ts`/`repository.ts`-ում |
| Redis cache (page 1) | `modules/transactions/service.ts` |
| CSV streaming/backpressure | `modules/transactions/router.ts` |
| Worker Thread report | `modules/reports/service.ts` + `modules/reports/worker.ts` |
| Report status storage | `modules/reports/repository.ts` (Redis) |
| Cluster + self-healing | `index.ts` |
| Rate limiting | `core/rateLimiter.middleware.ts`, `modules/deposits/middleware.ts` |
| Deadlock retry (bonus) | `utils/withDeadlockRetry.ts`, `scripts/deadlock-demo.ts` |
| Module auto-loader | `server.ts` → `loadModules()`/`signRoutes()` |
