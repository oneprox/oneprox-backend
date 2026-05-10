'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tenant_payment_logs', 'spk', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Nomor SPK',
    });

    await queryInterface.addColumn('tenant_payment_logs', 'invoice_number', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Nomor invoice',
    });

    await queryInterface.addColumn('tenant_payment_logs', 'invoice_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      comment: 'Tanggal invoice',
    });

    await queryInterface.addColumn('tenant_payment_logs', 'pph', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Nilai PPh (Rp)',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('tenant_payment_logs', 'spk');
    await queryInterface.removeColumn('tenant_payment_logs', 'invoice_number');
    await queryInterface.removeColumn('tenant_payment_logs', 'invoice_date');
    await queryInterface.removeColumn('tenant_payment_logs', 'pph');
  },
};
