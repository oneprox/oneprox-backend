'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('units', 'building_area', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Luas bangunan (m2)'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('units', 'building_area');
  },
};

