'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tasks', 'non_routine_group_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex('tasks', ['non_routine_group_id'], {
      name: 'tasks_non_routine_group_id_idx',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('tasks', 'tasks_non_routine_group_id_idx');
    await queryInterface.removeColumn('tasks', 'non_routine_group_id');
  },
};
