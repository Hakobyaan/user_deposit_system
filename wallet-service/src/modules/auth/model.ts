// Auth has no table of its own — there's no separate users/passwords store.
// It's a demo login: username `user<id>` with password equal to the
// username, checked against an existing modules/accounts row. This file
// documents that (see modules/accounts/model.ts for the table it validates
// against), matching the convention every module folder has a model.ts.
export { default as Account } from '../accounts/model';
