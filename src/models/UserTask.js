const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

const UserTaskStatusStrToInt = {
  'pending': 0,
  'inprogress': 1,
  'completed': 2,
};

const UserTaskStatusIntToStr = {
  0: 'pending',
  1: 'inprogress',
  2: 'completed',
};

class UserTask extends Model {}

UserTask.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  task_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  start_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // pending
    allowNull: false,
    comment: 'Status: 0=pending, 1=inprogress, 2=completed'
  },
  code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_main_task: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indicates if this is a main user task (true) or child user task (false)'
  },
  parent_user_task_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Reference to parent user task if this is a child task'
  },
  time: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Schedule time from task_schedules (HH:mm format)'
  },
  is_routine: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'true: rutin (generate shift); false: non-rutin (bulanan)',
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
  modelName: 'UserTask',
  tableName: 'user_tasks',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['task_id'] },
    { fields: ['user_id', 'task_id'] },
    { fields: ['code'] },
    { fields: ['is_main_task'] },
    { fields: ['parent_user_task_id'] },
    { fields: ['user_id', 'is_routine'] },
  ],
});

UserTask.associate = (models) => {
  UserTask.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user',
  });
  UserTask.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task',
  });
  UserTask.hasMany(models.UserTaskEvidence, {
    foreignKey: 'user_task_id',
    as: 'evidences',
  });
  // Self-referencing association for parent-child relationship
  UserTask.belongsTo(models.UserTask, {
    foreignKey: 'parent_user_task_id',
    as: 'parentUserTask',
  });
  UserTask.hasMany(models.UserTask, {
    foreignKey: 'parent_user_task_id',
    as: 'childUserTasks',
  });
};

module.exports = UserTask;
module.exports.UserTaskStatusIntToStr = UserTaskStatusIntToStr;
module.exports.UserTaskStatusStrToInt = UserTaskStatusStrToInt;
