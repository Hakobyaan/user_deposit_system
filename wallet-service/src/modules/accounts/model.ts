import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../database';

interface IAccount {
  id: number;
  userId: number;
  balance: string;
}

type AccountCreation = Optional<IAccount, 'id' | 'balance'>;

class Account extends Model<IAccount, AccountCreation> implements IAccount {
  public id!: number;
  public userId!: number;
  public balance!: string;
}

Account.init({
  id: {
    type:          DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey:    true,
  },
  userId: {
    type:      DataTypes.INTEGER,
    allowNull: false,
    unique:    true,
    field:     'user_id',
  },
  // DECIMAL, not FLOAT — money is never represented with binary floating point.
  balance: {
    type:         DataTypes.DECIMAL(18, 2),
    allowNull:    false,
    defaultValue: 0,
  },
}, {
  sequelize,
  tableName:  'accounts',
  underscored: true,
});

export default Account;
