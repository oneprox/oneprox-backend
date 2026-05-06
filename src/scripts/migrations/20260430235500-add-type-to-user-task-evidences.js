'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('user_task_evidences', 'type', {
      type: Sequelize.ENUM('before', 'after'),
      allowNull: false,
      defaultValue: 'after',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('user_task_evidences', 'type');
  },
};

