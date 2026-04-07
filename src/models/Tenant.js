const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

class Tenant extends Model {}

const DurationUnit = {
  "year": 0,
  "month": 1
}

const DurationUnitStr = {
  0: "year",
  1: "month"
}

const TenantStatusStrToInt = {
  'inactive': 0,
  'active': 1,
  'pending': 2,
  'expired': 3,
  'terminated': 4,
  'blacklisted': 5
}

const TenantStatusIntToStr = {
  0: 'inactive',
  1: 'active',
  2: 'pending',
  3: 'expired',
  4: 'terminated',
  5: 'blacklisted'
}

Tenant.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  contract_begin_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  contract_end_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  rent_duration: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  rent_duration_unit: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  rent_price: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  down_payment: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  deposit: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  payment_term: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Payment term: 0=year, 1=month'
  },
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  sub_category: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Sub kategori tenant'
  },
  status: {
    type: DataTypes.INTEGER,
    defaultValue: 2, // pending
    comment: 'Status: 0=inactive, 1=active, 2=pending, 3=expired, 4=terminated, 5=blacklisted'
  },
  payment_status: {
    type: DataTypes.ENUM('paid', 'scheduled', 'reminder_needed', 'overdue'),
    allowNull: true,
    defaultValue: 'scheduled',
    comment: 'Payment status: paid, scheduled, reminder_needed, overdue'
  },
  building_area: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Luas bangunan dalam m²'
  },
  land_area: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Luas tanah dalam m²'
  },
  electricity_power: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Daya listrik dalam VA'
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  updated_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
}, {
  sequelize,
  modelName: 'Tenant',
  tableName: 'tenants',
  timestamps: false,
});

Tenant.associate = (models) => {
  Tenant.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  Tenant.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updatedBy',
  });
  Tenant.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
  Tenant.belongsTo(models.TenantCategory, {
    foreignKey: 'category_id',
    as: 'category'
  });
}

module.exports = {Tenant, DurationUnit, DurationUnitStr, TenantStatusIntToStr, TenantStatusStrToInt};