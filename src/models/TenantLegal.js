const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

class TenantLegal extends Model {}

TenantLegal.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  doc_type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Jenis dokumen legal'
  },
  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Tanggal jatuh tempo dokumen'
  },
  keterangan: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Keterangan dokumen'
  },
  document_url: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL dokumen yang diupload'
  },
  status: {
    type: DataTypes.ENUM('belum_selesai', 'selesai'),
    allowNull: false,
    defaultValue: 'belum_selesai',
    comment: 'Status dokumen: belum_selesai, selesai'
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
  modelName: 'TenantLegal',
  tableName: 'tenant_legals',
  timestamps: false,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['due_date'] },
    { fields: ['created_at'] },
  ],
});

TenantLegal.associate = (models) => {
  TenantLegal.belongsTo(models.Tenant, {
    foreignKey: 'tenant_id',
    as: 'tenant',
  });
  TenantLegal.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  TenantLegal.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updatedBy',
  });
};

// Add name property for Sequelize model registry
TenantLegal.name = 'TenantLegal';

module.exports = TenantLegal;
