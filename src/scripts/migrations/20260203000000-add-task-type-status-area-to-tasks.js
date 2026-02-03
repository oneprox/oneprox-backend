'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tasks', 'task_type', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '0=non_repeat, 1=repeat',
    });
    await queryInterface.addColumn('tasks', 'status', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '0=inactive, 1=active',
    });
    await queryInterface.addColumn('tasks', 'area', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Area string; non_repeat default "all area", repeat empty',
    });
    await queryInterface.addIndex('tasks', ['task_type']);
    await queryInterface.addIndex('tasks', ['status']);
    // Backfill: existing tasks are all repeat (task_type=1, area empty)
    await queryInterface.sequelize.query(
      "UPDATE tasks SET task_type = 1, area = NULL"
    );
  },

  down: async (queryInterface) => {
    try {
      await queryInterface.removeIndex('tasks', ['task_type']);
      await queryInterface.removeIndex('tasks', ['status']);
    } catch (_e) {}
    await queryInterface.removeColumn('tasks', 'task_type');
    await queryInterface.removeColumn('tasks', 'status');
    await queryInterface.removeColumn('tasks', 'area');
  },
};
