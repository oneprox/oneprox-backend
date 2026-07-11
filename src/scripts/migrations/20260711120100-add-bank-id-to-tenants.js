'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('tenants');

    if (!tableDescription.bank_id) {
      await queryInterface.addColumn('tenants', 'bank_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'banks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });

      await queryInterface.addIndex('tenants', ['bank_id']);
    }
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('tenants', ['bank_id']);
    await queryInterface.removeColumn('tenants', 'bank_id');
  },
};
