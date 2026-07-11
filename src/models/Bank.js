const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

class Bank extends Model {}

Bank.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  bank_account: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  holder_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  modelName: 'Bank',
  tableName: 'banks',
  timestamps: false,
  indexes: [
    { fields: ['is_active'] },
    { fields: ['bank_name'] },
  ],
});

Bank.associate = (models) => {
  Bank.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  Bank.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updatedBy',
  });
};

module.exports = Bank;
