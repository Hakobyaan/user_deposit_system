// Same reasoning as modules/deposits/model.ts: a transfer doesn't own a
// table — it debits one Account, credits another, and inserts two
// TransactionModel rows (transfer_out/transfer_in), all inside one DB
// transaction; see service.ts.
export { default as Account } from '../accounts/model';
export { default as TransactionModel } from '../transactions/model';
