const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

const PaymentLogStatusStrToInt = {
  'unpaid': 0,
  'paid': 1,
  'expired': 2
};

const PaymentLogStatusIntToStr = {
  0: 'unpaid',
  1: 'paid',
  2: 'expired'
};

class TenantPaymentLog extends Model {}

TenantPaymentLog.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  paid_amount: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Amount paid - will be filled when payment is made'
  },
  payment_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Payment date - will be filled when payment is made'
  },
  payment_deadline: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Payment deadline date for this payment'
  },
  reminder_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the payment reminder email was sent'
  },
  payment_method: {
    type: DataTypes.ENUM('cash', 'bank_transfer', 'qris', 'other'),
    allowNull: true,
  },
  status: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0, // 0 = unpaid
    comment: 'Status: 0=unpaid, 1=paid, 2=expired'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  billing_type: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Jenis tagihan (sewa, listrik, air, service, lainnya)'
  },
  billing_period: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Periode tagihan (contoh: Januari 2024)'
  },
  billing_amount: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Total tagihan (amount + ppn)'
  },
  ppn: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Nilai PPN (Rp) = amount * ppn_percent',
  },
  ppn_percent: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Persentase PPN sebagai fraksi desimal (0.11 = 11%)',
  },
  outstanding: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Outstanding amount'
  },
  overdue: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Overdue amount'
  },
  rate: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: 0.01,
    comment: 'Rate (default 0.01)'
  },
  last_charge_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last charge date'
  },
  spk: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Nomor SPK',
  },
  invoice_number: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Nomor invoice',
  },
  invoice_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Tanggal invoice',
  },
  pph: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Nilai PPh (Rp)',
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
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'TenantPaymentLog',
  tableName: 'tenant_payment_logs',
  timestamps: false,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['payment_date'] },
    { fields: ['payment_deadline'] },
    { fields: ['reminder_sent_at'] },
    { fields: ['created_at'] },
    { fields: ['status'] },
  ],
});

TenantPaymentLog.associate = (models) => {
  TenantPaymentLog.belongsTo(models.Tenant, {
    foreignKey: 'tenant_id',
    as: 'tenant',
  });
  TenantPaymentLog.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  TenantPaymentLog.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updatedBy',
  });
};

module.exports = { TenantPaymentLog, PaymentLogStatusStrToInt, PaymentLogStatusIntToStr };

