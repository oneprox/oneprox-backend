const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

const TaskType = {
  NON_REPEAT: 0,
  REPEAT: 1,
};
const TaskTypeStrToInt = { non_repeat: 0, repeat: 1 };
const TaskTypeIntToStr = { 0: 'non_repeat', 1: 'repeat' };

const TaskStatus = {
  INACTIVE: 0,
  ACTIVE: 1,
};
const TaskStatusStrToInt = { inactive: 0, active: 1 };
const TaskStatusIntToStr = { 0: 'inactive', 1: 'active' };

class Task extends Model {}

Task.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  is_main_task: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_need_validation: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_scan: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  scan_code: DataTypes.STRING,
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  asset_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  is_all_times: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  task_group_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  task_type: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: TaskType.REPEAT,
    comment: '0=non_repeat, 1=repeat',
  },
  status: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: TaskStatus.ACTIVE,
    comment: '0=inactive, 1=active',
  },
  area: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Non-repeat default "all area"; repeat empty',
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
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
  modelName: 'Task',
  tableName: 'tasks',
  timestamps: false,
});

Task.associate = (models) => {
  Task.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  Task.belongsTo(models.Asset, {
    foreignKey: 'asset_id',
    as: 'asset'
  });
  Task.belongsTo(models.Role, {
    foreignKey: 'role_id',
    as: 'role',
  });
  Task.hasMany(models.TaskSchedule, {
    foreignKey: 'task_id',
    as: 'schedules',
  });
  Task.belongsTo(models.TaskGroup, {
    foreignKey: 'task_group_id',
    as: 'taskGroup',
  });
  Task.hasMany(models.TaskParent, {
    foreignKey: 'child_task_id',
    as: 'parentRelations',
  });
  Task.hasMany(models.TaskParent, {
    foreignKey: 'parent_task_id',
    as: 'childRelations',
  });
}

module.exports = Task;
module.exports.TaskType = TaskType;
module.exports.TaskTypeStrToInt = TaskTypeStrToInt;
module.exports.TaskTypeIntToStr = TaskTypeIntToStr;
module.exports.TaskStatus = TaskStatus;
module.exports.TaskStatusStrToInt = TaskStatusStrToInt;
module.exports.TaskStatusIntToStr = TaskStatusIntToStr;