const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

class UserTaskEvidence extends Model {}

UserTaskEvidence.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  user_task_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('before', 'after'),
    allowNull: false,
    defaultValue: 'after',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  modelName: 'UserTaskEvidence',
  tableName: 'user_task_evidences',
  timestamps: false,
  indexes: [
    { fields: ['user_task_id'] },
    { fields: ['type'] },
    { fields: ['created_at'] },
  ],
});

UserTaskEvidence.associate = (models) => {
  UserTaskEvidence.belongsTo(models.UserTask, {
    foreignKey: 'user_task_id',
    as: 'userTask',
  });
};

module.exports = UserTaskEvidence;
