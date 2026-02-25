'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add sub_category column to tenants table
    await queryInterface.addColumn('tenants', 'sub_category', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Sub kategori tenant'
    });

    // Create tenant_assets table
    await queryInterface.createTable('tenant_assets', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'tenants',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      asset_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'assets',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      }
    });

    // Add indexes
    await queryInterface.addIndex('tenant_assets', ['tenant_id']);
    await queryInterface.addIndex('tenant_assets', ['asset_id']);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tenant_assets table
    await queryInterface.dropTable('tenant_assets');
    
    // Remove sub_category column from tenants table
    await queryInterface.removeColumn('tenants', 'sub_category');
  }
};
