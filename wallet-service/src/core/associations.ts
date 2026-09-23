import Account from '../modules/accounts/model';
import TransactionModel from '../modules/transactions/model';

Account.hasMany(TransactionModel, {
  foreignKey: 'userId',
  sourceKey:  'userId',
  as:         'transactions',
});

TransactionModel.belongsTo(Account, {
  foreignKey: 'userId',
  targetKey:  'userId',
  as:         'account',
});
