const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

class DepositoLog extends Model {}

DepositoLog.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  deposit_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
    comment: 'Signed amount: positive = credit, negative = debit',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'DepositoLog',
  tableName: 'deposito_logs',
  timestamps: false,
});

DepositoLog.associate = (models) => {
  DepositoLog.belongsTo(models.Tenant, {
    foreignKey: 'tenant_id',
    as: 'tenant',
  });
  DepositoLog.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  DepositoLog.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updatedBy',
  });
};

module.exports = DepositoLog;
