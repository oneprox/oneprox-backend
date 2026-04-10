'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tasks', 'is_routine', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn('tasks', 'monthly_frequency', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('tasks', 'due_date', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('tasks', 'area', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('tasks', 'assigned_user_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addColumn('tasks', 'non_routine_items', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('tasks', 'non_routine_items');
    await queryInterface.removeColumn('tasks', 'assigned_user_id');
    await queryInterface.removeColumn('tasks', 'area');
    await queryInterface.removeColumn('tasks', 'due_date');
    await queryInterface.removeColumn('tasks', 'monthly_frequency');
    await queryInterface.removeColumn('tasks', 'is_routine');
  }
};
