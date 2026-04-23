'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('complaint_reports', 'asset_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'assets',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Asset ID related to complaint/report'
    });

    await queryInterface.addIndex('complaint_reports', ['asset_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('complaint_reports', ['asset_id']);
    await queryInterface.removeColumn('complaint_reports', 'asset_id');
  },
};
