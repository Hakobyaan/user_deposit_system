import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../database';

interface ITransaction {
  id: number;
  userId: number;
  amount: string;
  type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out';
  balanceAfter: string;
  createdAt?: Date;
}

type TransactionCreation = Optional<ITransaction, 'id' | 'createdAt'>;

class TransactionModel extends Model<ITransaction, TransactionCreation> implements ITransaction {
  public id!: number;
  public userId!: number;
  public amount!: string;
  public type!: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out';
  public balanceAfter!: string;
  public readonly createdAt!: Date;
}

TransactionModel.init({
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  userId: {
    type:      DataTypes.INTEGER,
    allowNull: false,
    field:     'user_id',
  },
  amount: {
    type:      DataTypes.DECIMAL(18, 2),
    allowNull: false,
  },
  type: {
    type:      DataTypes.ENUM('deposit', 'withdrawal', 'transfer_in', 'transfer_out'),
    allowNull: false,
  },
  balanceAfter: {
    type:      DataTypes.DECIMAL(18, 2),
    allowNull: false,
    field:     'balance_after',
  },
}, {
  sequelize,
  tableName:   'transactions',
  underscored: true,
  updatedAt:   false,
  // The leftmost prefix of this index is user_id, so
  // `WHERE user_id = $1 ORDER BY created_at DESC` is satisfied entirely
  // by an index scan — no separate sort step, no full table scan.
  indexes: [
    {
      name:   'idx_user_created',
      fields: ['user_id', 'created_at'],
    },
  ],
});

export default TransactionModel;
