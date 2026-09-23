// Same reasoning as model.ts: deposits reuses the repositories already
// owned by accounts/transactions instead of duplicating them. `service.ts`
// doesn't actually call these — the deposit itself needs `SELECT ... FOR
// UPDATE` inside a single Sequelize transaction with an explicit isolation
// level, which `CoreRepository`'s generic methods don't expose, so
// `service.ts` talks to the Sequelize models directly for that one
// operation. This file exists so this module's data-access layer is still
// discoverable from a repository.ts, same as every other module.
export { AccountRepository } from '../accounts/repository';
export { TransactionRepository } from '../transactions/repository';
