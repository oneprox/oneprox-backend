const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

class TenantAsset extends Model {}

TenantAsset.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  asset_id: {
    type: DataTypes.UUID,
    allowNull: false,
  }
}, {
  sequelize,
  modelName: 'TenantAsset',
  tableName: 'tenant_assets',
  timestamps: false,
});

TenantAsset.associate = (models) => {
  TenantAsset.belongsTo(models.Tenant, {
    foreignKey: 'tenant_id',
    as: 'tenant',
  });
  TenantAsset.belongsTo(models.Asset, {
    foreignKey: 'asset_id',
    as: 'asset',
  });
};

module.exports = TenantAsset;
