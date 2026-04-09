'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('user_tasks', 'is_routine', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'true = task rutin (generate shift); false = task non-rutin (bulanan)',
    });
    await queryInterface.sequelize.query(
      `UPDATE user_tasks SET is_routine = false WHERE code IS NOT NULL AND code LIKE 'NR:%'`
    );
    await queryInterface.addIndex('user_tasks', ['user_id', 'is_routine'], {
      name: 'user_tasks_user_id_is_routine_idx',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('user_tasks', 'user_tasks_user_id_is_routine_idx');
    await queryInterface.removeColumn('user_tasks', 'is_routine');
  },
};
