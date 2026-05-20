'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tenant_payment_logs', 'ppn', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Nilai PPN (Rp) = amount * ppn_percent',
    });
    await queryInterface.addColumn('tenant_payment_logs', 'ppn_percent', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Persentase PPN sebagai fraksi desimal (0.11 = 11%)',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tenant_payment_logs', 'ppn_percent');
    await queryInterface.removeColumn('tenant_payment_logs', 'ppn');
  },
};
