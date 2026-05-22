'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tenants', 'ppn', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0,
      comment: 'PPN kontrak (Rp), input manual',
    });
    await queryInterface.addColumn('tenants', 'total_price', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Total harga = rent_price + ppn',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('tenants', 'total_price');
    await queryInterface.removeColumn('tenants', 'ppn');
  },
};
