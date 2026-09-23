// The deposits module doesn't own a database table of its own — a deposit
// mutates `Account.balance` (owned by modules/accounts) and inserts a
// `TransactionModel` row (owned by modules/transactions) inside one DB
// transaction; see service.ts. Re-exported here so this module's model.ts
// still documents exactly which tables `service.ts` touches.
export { default as Account } from '../accounts/model';
export { default as TransactionModel } from '../transactions/model';
