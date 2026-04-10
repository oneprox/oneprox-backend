'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns to tenants table
    await queryInterface.addColumn('tenants', 'building_area', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Luas bangunan dalam m²'
    });
    await queryInterface.addColumn('tenants', 'land_area', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Luas tanah dalam m²'
    });
    await queryInterface.addColumn('tenants', 'electricity_power', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Daya listrik dalam VA'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove columns
    await queryInterface.removeColumn('tenants', 'building_area');
    await queryInterface.removeColumn('tenants', 'land_area');
    await queryInterface.removeColumn('tenants', 'electricity_power');
  },
};
