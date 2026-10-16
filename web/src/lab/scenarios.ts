import type { TraceEvent } from '../api';
import { formatMoney, newIdempotencyKey } from '../format';
import { balanceOf, deposit, round2, traceOf, transfer, type RawResponse } from './client';

export type Category = 'Idempotency' | 'Rollback' | 'Concurrency' | 'Guards';

export interface Check { label: string; pass: boolean; detail?: string; note?: boolean }

export class Skip extends Error {}

export interface Ctx {
  traceId: string;
  faultInjection: boolean;
  check: (label: string, pass: boolean, detail?: string) => void;
  note: (label: string, detail?: string) => void;
  requireFaults: () => void;
  ensureFunds: (userId: number, min: number) => Promise<number>;
  serverTrace: () => Promise<TraceEvent[]>;
}

export interface Scenario {
  id: string;
  category: Category;
  title: string;
  summary: string;
  expect: string;
  run: (ctx: Ctx) => Promise<void>;
}

const $ = (n: number) => `$${formatMoney(n)}`;
const statusLine = (r: RawResponse) => `${r.status}${r.message ? ` · ${r.message}` : ''} · ${r.ms}ms`;
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
const rateLimited = (r: RawResponse) => {
  if (r.status === 429) throw new Error('Deposit rate limit hit for this user — wait ~60s and run again');
};

export const SCENARIOS: Scenario[] = [
  // ---------------- idempotency ----------------
  {
    id:       'idem-replay',
    category: 'Idempotency',
    title:    'Same Idempotency-Key sent twice',
    summary:  'A client retries a deposit (e.g. after a timeout) with the same Idempotency-Key.',
    expect:   'Second call replays the stored response — same transactionId, money credited once.',
    run:      async (c) => {
      const before = await balanceOf(1);
      const key = newIdempotencyKey();
      const r1 = await deposit(1, 25, { key, traceId: c.traceId });
      rateLimited(r1);
      c.check('First request is processed', r1.status === 201, statusLine(r1));
      const r2 = await deposit(1, 25, { key, traceId: c.traceId });
      c.check('Retry returns the same response', r2.status === 201 && r2.data?.transactionId === r1.data?.transactionId,
        `transactionId #${r1.data?.transactionId} vs #${r2.data?.transactionId}`);
      const after = await balanceOf(1);
      c.check('Balance grew by $25 exactly once', same(after, before + 25), `${$(before)} → ${$(after)}`);
    },
  },
  {
    id:       'idem-concurrent',
    category: 'Idempotency',
    title:    'Double-click: 5 parallel requests, one key',
    summary:  'Five identical deposits with one key race each other (SET NX claim in Redis).',
    expect:   'Exactly one write. Others get 409 "still processing" or a replay of the same result.',
    run:      async (c) => {
      const before = await balanceOf(2);
      const key = newIdempotencyKey();
      const rs = await Promise.all(Array.from({ length: 5 }, () => deposit(2, 10, { key, traceId: c.traceId })));
      rs.forEach(rateLimited);
      const ids = new Set(rs.filter((r) => r.status === 201).map((r) => r.data.transactionId));
      c.note('Responses', rs.map((r) => r.status).join(', '));
      c.check('Only one transaction was created', ids.size === 1, `distinct transactionIds: ${[...ids].join(', ') || 'none'}`);
      c.check('Every other request was 409 or a replay', rs.every((r) => r.status === 201 || r.status === 409));
      const after = await balanceOf(2);
      c.check('Balance grew by $10 exactly once', same(after, before + 10), `${$(before)} → ${$(after)}`);
    },
  },
  {
    id:       'idem-retry-after-failure',
    category: 'Idempotency',
    title:    'Failed deposit, then retry with the same key',
    summary:  'The deposit crashes right before COMMIT. The client retries with the same key.',
    expect:   'Crash → rollback + key released. Retry succeeds once; a third call is just a replay.',
    run:      async (c) => {
      c.requireFaults();
      const before = await balanceOf(3);
      const key = newIdempotencyKey();
      const r1 = await deposit(3, 40, { key, traceId: c.traceId, fault: 'deposit.before-commit' });
      rateLimited(r1);
      c.check('Injected crash returns 500', r1.status === 500, statusLine(r1));
      const mid = await balanceOf(3);
      c.check('Nothing was credited (rolled back)', same(mid, before), `${$(before)} → ${$(mid)}`);
      const r2 = await deposit(3, 40, { key, traceId: c.traceId });
      c.check('Retry with the same key is processed', r2.status === 201, statusLine(r2));
      const r3 = await deposit(3, 40, { key, traceId: c.traceId });
      c.check('Third call replays, no new write', r3.data?.transactionId === r2.data?.transactionId,
        `#${r2.data?.transactionId} vs #${r3.data?.transactionId}`);
      const after = await balanceOf(3);
      c.check('Balance grew by $40 exactly once', same(after, before + 40), `${$(before)} → ${$(after)}`);
    },
  },

  // ---------------- rollback ----------------
  {
    id:       'rb-after-debit',
    category: 'Rollback',
    title:    'Crash after debiting the sender',
    summary:  'user1 → user2 $15. The process fails after user1 was debited but before user2 was credited.',
    expect:   '500, and both balances are exactly what they were — no money disappears.',
    run:      async (c) => {
      c.requireFaults();
      await c.ensureFunds(1, 15);
      const [a0, b0] = [await balanceOf(1), await balanceOf(2)];
      const r = await transfer(1, 2, 15, { traceId: c.traceId, fault: 'transfer.after-debit' });
      c.check('Transfer fails with 500', r.status === 500, statusLine(r));
      const [a1, b1] = [await balanceOf(1), await balanceOf(2)];
      c.check('user1 balance unchanged', same(a0, a1), `${$(a0)} → ${$(a1)}`);
      c.check('user2 balance unchanged', same(b0, b1), `${$(b0)} → ${$(b1)}`);
      const events = await c.serverTrace();
      c.check('Server saw the debit, then ROLLBACK',
        events.some((e) => e.kind === 'transfer.debit') && events.some((e) => e.kind === 'transfer.rollback'));
    },
  },
  {
    id:       'rb-before-commit',
    category: 'Rollback',
    title:    'Crash after both ledger rows were written',
    summary:  'user1 → user3 $20. Both balances and both transaction rows are written, then it fails before COMMIT.',
    expect:   'All four writes vanish together — balances unchanged, rows never become visible.',
    run:      async (c) => {
      c.requireFaults();
      await c.ensureFunds(1, 20);
      const [a0, b0] = [await balanceOf(1), await balanceOf(3)];
      const r = await transfer(1, 3, 20, { traceId: c.traceId, fault: 'transfer.before-commit' });
      c.check('Transfer fails with 500', r.status === 500, statusLine(r));
      const [a1, b1] = [await balanceOf(1), await balanceOf(3)];
      c.check('user1 balance unchanged', same(a0, a1), `${$(a0)} → ${$(a1)}`);
      c.check('user3 balance unchanged', same(b0, b1), `${$(b0)} → ${$(b1)}`);
      const events = await c.serverTrace();
      const rows = events.find((e) => e.kind === 'transfer.rows');
      c.check('Rows were inserted inside the transaction', !!rows, rows?.message);
      c.check('…and then rolled back', events.some((e) => e.kind === 'transfer.rollback'));
    },
  },
  {
    id:       'rb-insufficient',
    category: 'Rollback',
    title:    'Insufficient balance',
    summary:  'user4 tries to send $1,000 more than they have.',
    expect:   '400 "Insufficient balance", no balance changes on either side.',
    run:      async (c) => {
      const [a0, b0] = [await balanceOf(4), await balanceOf(1)];
      const r = await transfer(4, 1, round2(a0 + 1000), { traceId: c.traceId });
      c.check('Rejected with 400', r.status === 400, statusLine(r));
      const [a1, b1] = [await balanceOf(4), await balanceOf(1)];
      c.check('Balances unchanged', same(a0, a1) && same(b0, b1), `user4 ${$(a0)} → ${$(a1)}, user1 ${$(b0)} → ${$(b1)}`);
    },
  },
  {
    id:       'rb-unknown-recipient',
    category: 'Rollback',
    title:    'Recipient does not exist',
    summary:  'user1 sends $5 to user9999.',
    expect:   '404, sender keeps their money.',
    run:      async (c) => {
      await c.ensureFunds(1, 5);
      const a0 = await balanceOf(1);
      const r = await transfer(1, 9999, 5, { traceId: c.traceId });
      c.check('Rejected with 404', r.status === 404, statusLine(r));
      const a1 = await balanceOf(1);
      c.check('user1 balance unchanged', same(a0, a1), `${$(a0)} → ${$(a1)}`);
    },
  },

  // ---------------- concurrency ----------------
  {
    id:       'cc-double-spend',
    category: 'Concurrency',
    title:    'Double spend: 8 parallel transfers',
    summary:  'user4 fires 8 transfers at once, each ~⅓ of the balance (SELECT … FOR UPDATE row locks).',
    expect:   'Exactly 2 succeed, the rest get "Insufficient balance". Balance never goes negative.',
    run:      async (c) => {
      await c.ensureFunds(4, 30);
      const users = [1, 2, 3, 4];
      const before = await Promise.all(users.map(balanceOf));
      const b = before[3];
      const amount = round2(Math.floor((b / 3) * 100) / 100 + 0.01);
      const allowed = Math.floor(b / amount);
      c.note('Setup', `user4 has ${$(b)}, each transfer is ${$(amount)} → at most ${allowed} can fit`);
      const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => transfer(4, (i % 3) + 1, amount, { traceId: c.traceId })));
      const ok = rs.filter((r) => r.status === 200).length;
      c.note('Responses', rs.map((r) => r.status).join(', '));
      c.check(`Exactly ${allowed} transfers succeeded`, ok === allowed, `${ok} succeeded`);
      c.check('The rest were rejected with 400', rs.every((r) => r.status === 200 || r.status === 400));
      const after = await Promise.all(users.map(balanceOf));
      c.check('user4 balance is correct and ≥ 0', same(after[3], b - ok * amount) && after[3] >= 0, `${$(b)} → ${$(after[3])}`);
      const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
      c.check('Total money across users is conserved', same(sum(before), sum(after)), `${$(sum(before))} → ${$(sum(after))}`);
    },
  },
  {
    id:       'cc-opposite',
    category: 'Concurrency',
    title:    'Opposite transfers (deadlock bait)',
    summary:  'user2 → user3 and user3 → user2, 6 of each, all at the same time.',
    expect:   'All 12 succeed. Accounts are locked in id order, so no deadlock; net change is zero.',
    run:      async (c) => {
      await c.ensureFunds(2, 6);
      await c.ensureFunds(3, 6);
      const [a0, b0] = [await balanceOf(2), await balanceOf(3)];
      const rs = await Promise.all(Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? transfer(3, 2, 1, { traceId: c.traceId }) : transfer(2, 3, 1, { traceId: c.traceId }))));
      c.check('All 12 transfers succeeded', rs.every((r) => r.status === 200), rs.map((r) => r.status).join(', '));
      const [a1, b1] = [await balanceOf(2), await balanceOf(3)];
      c.check('Both balances back where they started', same(a0, a1) && same(b0, b1),
        `user2 ${$(a0)} → ${$(a1)}, user3 ${$(b0)} → ${$(b1)}`);
      const retries = (await c.serverTrace()).filter((e) => e.kind === 'deadlock.retry').length;
      c.note('Deadlock retries on the server', String(retries));
    },
  },
  {
    id:       'cc-fan-out',
    category: 'Concurrency',
    title:    'Fan-out: user1 pays everyone at once',
    summary:  'user1 sends $3 to user2, user3, user4 and user5 in parallel.',
    expect:   'Each receiver gets +$3, user1 loses exactly $12, and 8 ledger rows appear.',
    run:      async (c) => {
      await c.ensureFunds(1, 12);
      const to = [2, 3, 4, 5];
      const [s0, ...r0] = await Promise.all([1, ...to].map(balanceOf));
      const rs = await Promise.all(to.map((id) => transfer(1, id, 3, { traceId: c.traceId })));
      c.check('All 4 transfers succeeded', rs.every((r) => r.status === 200), rs.map((r) => r.status).join(', '));
      const [s1, ...r1] = await Promise.all([1, ...to].map(balanceOf));
      c.check('user1 lost exactly $12', same(s1, s0 - 12), `${$(s0)} → ${$(s1)}`);
      to.forEach((id, i) => c.check(`user${id} received $3`, same(r1[i], r0[i] + 3), `${$(r0[i])} → ${$(r1[i])}`));
      const rows = (await c.serverTrace()).filter((e) => e.kind === 'transfer.rows').length;
      c.check('Server wrote a transfer_out + transfer_in pair per transfer', rows === 4, `${rows} pairs`);
    },
  },

  // ---------------- guards ----------------
  {
    id:       'guard-ratelimit',
    category: 'Guards',
    title:    'Deposit rate limit',
    summary:  '12 deposits of $0.01 for user5 in a burst (limit is 10 per minute per user).',
    expect:   'At most 10 go through, the rest get 429. Blocks user5 deposits for up to a minute.',
    run:      async (c) => {
      const before = await balanceOf(5);
      const rs = await Promise.all(Array.from({ length: 12 }, () => deposit(5, 0.01, { traceId: c.traceId })));
      const ok = rs.filter((r) => r.status === 201).length;
      const limited = rs.filter((r) => r.status === 429).length;
      c.note('Responses', rs.map((r) => r.status).join(', '));
      c.check('Some requests were rejected with 429', limited > 0, `${limited} × 429`);
      c.check('No more than 10 went through', ok <= 10, `${ok} × 201`);
      const after = await balanceOf(5);
      c.check('Only accepted deposits were credited', same(after, before + ok * 0.01), `${$(before)} → ${$(after)}`);
    },
  },
  {
    id:       'guard-no-key',
    category: 'Guards',
    title:    'Deposit without Idempotency-Key',
    summary:  'POST /deposit with the header missing.',
    expect:   '400 before any DB work — balance unchanged.',
    run:      async (c) => {
      const before = await balanceOf(1);
      const r = await deposit(1, 50, { key: null, traceId: c.traceId });
      rateLimited(r);
      c.check('Rejected with 400', r.status === 400, statusLine(r));
      const after = await balanceOf(1);
      c.check('Balance unchanged', same(before, after), `${$(before)} → ${$(after)}`);
    },
  },
  {
    id:       'guard-auth',
    category: 'Guards',
    title:    'Transfer without a valid token',
    summary:  'POST /transfer with no Authorization header, then with a forged token.',
    expect:   'Both rejected with 401.',
    run:      async (c) => {
      const r1 = await transfer(1, 2, 1, { traceId: c.traceId, token: null });
      c.check('No token → 401', r1.status === 401, statusLine(r1));
      const r2 = await transfer(1, 2, 1, { traceId: c.traceId, token: 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.forged' });
      c.check('Forged token → 401', r2.status === 401, statusLine(r2));
    },
  },
  {
    id:       'guard-self',
    category: 'Guards',
    title:    'Transfer to yourself',
    summary:  'user2 sends $1 to user2.',
    expect:   '400, nothing written.',
    run:      async (c) => {
      const before = await balanceOf(2);
      const r = await transfer(2, 2, 1, { traceId: c.traceId });
      c.check('Rejected with 400', r.status === 400, statusLine(r));
      const after = await balanceOf(2);
      c.check('Balance unchanged', same(before, after), `${$(before)} → ${$(after)}`);
    },
  },
];

export interface RunResult {
  status: 'pass' | 'fail' | 'skip';
  checks: Check[];
  error?: string;
  trace: TraceEvent[];
  ms: number;
}

export async function runScenario(s: Scenario, faultInjection: boolean): Promise<RunResult> {
  const traceId = `lab:${s.id}:${Date.now().toString(36)}`;
  const checks: Check[] = [];
  const started = performance.now();

  const ctx: Ctx = {
    traceId,
    faultInjection,
    check:         (label, pass, detail) => checks.push({ label, pass, detail }),
    note:          (label, detail) => checks.push({ label, pass: true, detail, note: true }),
    requireFaults: () => {
      if (!faultInjection) throw new Skip('Fault injection is off — set FAULT_INJECTION=true for wallet-service');
    },
    ensureFunds: async (userId, min) => {
      const b = await balanceOf(userId);
      if (b >= min) return b;
      const r = await deposit(userId, 200, { traceId });
      rateLimited(r);
      if (r.status !== 201) throw new Error(`Could not fund user${userId}: ${r.message ?? r.status}`);
      ctx.note(`Funded user${userId} with $200`, `balance was ${$(b)}`);
      return Number(r.data.balance);
    },
    serverTrace: () => traceOf(traceId),
  };

  let status: RunResult['status'] = 'pass';
  let error: string | undefined;
  try {
    await s.run(ctx);
    if (checks.some((ch) => !ch.pass)) status = 'fail';
  } catch (err) {
    status = err instanceof Skip ? 'skip' : 'fail';
    error = (err as Error).message;
  }

  const trace = await traceOf(traceId).catch(() => []);
  return {
    status,
    checks,
    error,
    trace,
    ms: Math.round(performance.now() - started),
  };
}
