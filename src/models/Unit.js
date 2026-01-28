const { DataTypes, Model } = require("sequelize");
const sequelize = require("./sequelize");

const UnitStatusStrToInt = {
  'available': 0,
  'occupied': 1,
  'maintenance': 2,
  'reserved': 3,
  'inactive': 4,
  'out_of_order': 5
};

const UnitStatusIntToStr = {
  0: 'available',
  1: 'occupied',
  2: 'maintenance',
  3: 'reserved',
  4: 'inactive',
  5: 'out_of_order'
};

class Unit extends Model {}

Unit.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    asset_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    size: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    building_area: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    electrical_power: DataTypes.INTEGER,
    electrical_unit: {
      type: DataTypes.STRING,
      defaultValue: "Watt",
    },
    is_toilet_exist: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0, // 0 = available
      comment: 'Status: 0=available, 1=occupied, 2=maintenance, 3=reserved, 4=inactive, 5=out_of_order'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    is_deleted: DataTypes.BOOLEAN,
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    updated_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Unit",
    tableName: "units",
    timestamps: false,
    indexes: [
      { fields: ["code"] }, 
      { fields: ["asset_id"] },
      { fields: ["status"] }
    ],
  }
);

Unit.associate = (models) => {
  Unit.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  Unit.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updatedBy',
  });
  Unit.belongsTo(models.Asset, {
    foreignKey: 'asset_id',
    as: 'asset',
  });
};

module.exports = { Unit, UnitStatusStrToInt, UnitStatusIntToStr };
