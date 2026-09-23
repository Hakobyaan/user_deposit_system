# Առաջադրանք. User Deposit System (Microservices)

## Ընդհանուր նկարագրություն

Կառուցել **wallet/deposit համակարգ**, որտեղ user-ները կարող են **deposit** (գումար ավելացնել) անել իրենց հաշվին, համակարգը գրանցում է transaction history, ուղարկում notification, և թույլ է տալիս export անել պատմությունը։ Համակարգը կազմված է **3 microservice**-ից, որոնք հաղորդակցվում են RabbitMQ-ով։

---

## Architecture

```
┌──────────────┐      HTTP        ┌──────────────────┐
│   Client      │ ───────────────> │   API Gateway /   │
│  (Postman/UI) │                  │   Wallet Service   │  (Cluster-ով, N worker process)
└──────────────┘                  └─────────┬─────────┘
                                              │
                          ┌───────────────────┼────────────────────┐
                          │                   │                    │
                    PostgreSQL          Redis (cache,        RabbitMQ
                 (users, transactions)  idempotency,         (deposit.created event)
                                        rate limit)                │
                                                                    │
                                                          ┌─────────▼─────────┐
                                                          │ Notification       │
                                                          │ Service (consumer) │
                                                          └────────────────────┘
```

---

## Service 1: Wallet Service (API Gateway)

### Endpoint 1 — POST /deposit

**Ֆունկցիոնալություն**՝ User-ը deposit է անում գումար իր հաշվին։

**Պահանջներ**՝

1. **Idempotency** — request-ը պետք է ընդունի `Idempotency-Key` header։ Եթե նույն key-ով request արդեն processed է (ստուգել Redis-ում), վերադարձնել **cached արդյունքը**, չկատարել կրկնակի deposit։

2. **Database Transaction (ACID)** — deposit-ը պետք է թարմացնի **2 table** ատոմիկ.
   - `accounts.balance` ավելացնել deposit-ի summary-ով
   - `transactions` table-ում ավելացնել նոր տող (deposit-ի history)
   
   Օգտագործիր `BEGIN/COMMIT/ROLLBACK`, և համոզվիր, որ եթե 2-րդ INSERT-ը fail է լինում, առաջին UPDATE-ը **նույնպես** rollback է լինում։

3. **Row-level locking** — deposit-ի ընթացքում, եթե **նույն user-ը** paralel 2 deposit request ուղարկի (race condition), օգտագործիր `SELECT ... FOR UPDATE`, որպեսզի balance-ի update-ը լինի **safe**, առանց lost update-ի։

4. **Consistency constraint** — ավելացրու `CHECK (balance >= 0)` constraint accounts table-ում, ստուգիր, որ deposit-ից հետո balance-ը երբեք բացասական չի դառնում (deposit-ի դեպքում սա միշտ true կլինի, բայց սահմանիր, ինչպես կլինի withdrawal-ի դեպքում)։

5. **Publish event** — deposit-ի հաջողությունից հետո, publish արա `deposit.created` event **RabbitMQ**-ի `deposit_exchange`-ին (fanout կամ topic exchange), որպեսզի Notification Service-ը կարողանա consume անել։

### Endpoint 2 — GET /transactions/:userId

**Ֆունկցիոնալություն**՝ Վերադարձնում է user-ի transaction history, **paginated**, sorted ըստ ամսաթվի։

**Պահանջներ**՝

1. **Composite Index** — ստեղծիր `CREATE INDEX idx_user_created ON transactions(user_id, created_at)`, և query-ն գրիր այնպես, որ **օգտագործի** այս index-ը (leftmost prefix rule-ը հիշիր՝ `WHERE user_id = $1 ORDER BY created_at DESC`)։

2. **Redis Caching** — cache-aside pattern-ով, cache-ավորիր **առաջին էջի** արդյունքը (ամենահաճախ հարցվող), TTL՝ 30 վայրկյան։

### Endpoint 3 — GET /transactions/:userId/export

**Ֆունկցիոնալություն**՝ Export է անում **ամբողջ** transaction history որպես CSV ֆայլ, download-ի համար։

**Պահանջներ**՝

1. **Streams** — user-ը կարող է ունենալ **տասնյակ հազարավոր** transaction։ Օգտագործիր **Node.js Streams**՝ query result-ը (կամ database cursor-ը) **chunk-ներով** գրելու CSV format-ով, **առանց** ամբողջ dataset-ը memory-ում պահելու։ Pipe արա ուղիղ HTTP response-ին։

2. Ցույց տուր, որ հասկանում ես **backpressure**-ը — եթե client-ի download-ը դանդաղ է, stream-ը պետք է pause/resume կատարվի ճիշտ։

### Endpoint 4 — POST /reports/generate

**Ֆունկցիոնալություն**՝ Generate է անում **ծանր PDF/analytics report** (օրինակ՝ ամսական summary, category-ով breakdown, ֆիկտիվ ծանր հաշվարկով՝ simulate CPU-ինտենսիվ աշխատանք)։

**Պահանջներ**՝

1. **Worker Threads** — report generation-ը **պետք է** կատարվի առանձին Worker Thread-ում, ոչ թե main thread-ում, որպեսզի **API-ն շարունակի** սպասարկել այլ requests, մինչ ծանր հաշվարկը կատարվում է background-ում։

2. Endpoint-ը պետք է **անմիջապես** վերադարձնի `202 Accepted` + `reportId`, և ունենալ **երկրորդ endpoint** (`GET /reports/:reportId/status`), որով client-ը կարող է ստուգել, պատրաստ է՞ report-ը, թե ոչ (Worker Thread-ը `postMessage`-ով ասում է main thread-ին, երբ ավարտված է)։

### Scaling — Cluster

3. Ամբողջ **Wallet Service**-ը պետք է աշխատացվի **Cluster module**-ով՝ `os.cpus().length` worker process-երով, port sharing-ով։ Ցույց տուր, որ եթե մեկ worker-ը crash է լինում, master-ը **ինքնավերականգնում** է (`cluster.on('exit', ...)` → `cluster.fork()`)։

---

## Service 2: Notification Service (RabbitMQ Consumer)

**Ֆունկցիոնալություն**՝ Consume է անում `deposit.created` event-երը RabbitMQ-ից, և "ուղարկում" fake email (կարող ես simulate անել `console.log` + 1 վայրկյան delay-ով, կամ իրական `nodemailer`-ով)։

**Պահանջներ**՝

1. Առանձին **process/repository**, ոչ Wallet Service-ի մասը — իրական **microservice separation**։

2. **Retry logic** — եթե email-ի "ուղարկումը" fail է լինում (simulate ինքդ, random 20% fail rate), message-ը պետք է **requeue** լինի, max 3 փորձ, հետո ուղարկվի **Dead Letter Queue**-ին (`deposit_dlq`)։

3. **ACK mechanism** — message-ը պետք է acknowledge արվի **միայն** հաջողությամբ մշակելուց հետո, որպեսզի consumer-ի crash-ի դեպքում RabbitMQ-ն կրկին ուղարկի այն։

---

## Service 3: Rate Limiter Middleware (Redis)

**Ֆունկցիոնալություն**՝ Wallet Service-ի `/deposit` endpoint-ը պետք է ունենա rate limiting՝ **max 10 deposit request/րոպե/user**։

**Պահանջներ**՝

1. Redis `INCR` + `EXPIRE` combo (ատոմիկ), ինչպես քննարկեցինք։
2. Եթե limit-ը գերազանցվի, վերադարձրու `429 Too Many Requests`։

---

## Bonus (եթե ուզում ես ավելի խորանալ)

- Ավելացրու **Isolation Level**-ի explicit ընտրություն deposit transaction-ի համար (`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`), և բացատրիր comment-ով, թե ինչու հենց այս level-ը ես ընտրել
- Simulate **Deadlock** scenario (2 paralel transaction, որ lock են վերցնում հակառակ հերթականությամբ) unit test-ում, ցույց տուր, թե ինչպես retry logic-ը այն լուծում է
- Docker-ով **containerize** անել բոլոր 3 service-ները + PostgreSQL + Redis + RabbitMQ, `docker-compose.yml`-ով

---

## Ինչ պետք է հանձնես (Deliverables)

1. Աշխատող կոդ (2-3 service, առանձին folder-երով կամ repos)
2. `docker-compose.yml`, որ գործարկում է ամբողջ stack-ը (PostgreSQL, Redis, RabbitMQ, 3 service)
3. `README.md`՝ ինչպես գործարկել, ինչ endpoint-ներ կան
4. Կարճ `ARCHITECTURE.md`, որտեղ **բացատրում ես** (2-3 նախադասությամբ ամեն մեկի համար)՝
   - Ինչու ընտրեցիր այս isolation level-ը
   - Ինչպես idempotency-ն կանխում է կրկնակի deposit
   - Ինչու Worker Thread, ոչ թե ուղիղ async, report generation-ի համար
   - Ինչպես composite index-ը արագացնում է transaction history query-ն

---

## Ինչու է այս assignment-ը լավ պրակտիկա

Այս մեկ system-ը ստիպում է քեզ իրական կերպով օգտագործել.

| Թեմա | Որտեղ է օգտագործվում |
|---|---|
| Event Loop / non-blocking I/O | Ամբողջ API-ի հիմքում |
| Streams & Backpressure | CSV export |
| Worker Threads | PDF/report generation |
| Cluster | Wallet Service-ի scaling |
| Transactions / ACID | Deposit-ի balance + transaction insert |
| Isolation Levels / Locking | Race condition-ի կանխարգելում deposit-ի ժամանակ |
| Composite Index | Transaction history query |
| Idempotency | Deposit request-ի կրկնակի կանխարգելում |
| Redis | Cache, rate limiting, idempotency key storage |
| RabbitMQ | Wallet Service → Notification Service հաղորդակցություն |
| Microservices | 2-3 առանձին service-երի separation |
