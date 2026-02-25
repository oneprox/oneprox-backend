'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tenant_payment_logs', 'billing_type', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Jenis tagihan (sewa, listrik, air, service, lainnya)'
    });

    await queryInterface.addColumn('tenant_payment_logs', 'billing_period', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Periode tagihan (contoh: Januari 2024)'
    });

    await queryInterface.addColumn('tenant_payment_logs', 'billing_amount', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Jumlah tagihan'
    });

    await queryInterface.addColumn('tenant_payment_logs', 'outstanding', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Outstanding amount'
    });

    await queryInterface.addColumn('tenant_payment_logs', 'overdue', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Overdue amount'
    });

    await queryInterface.addColumn('tenant_payment_logs', 'rate', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0.01,
      comment: 'Rate (default 0.01)'
    });

    await queryInterface.addColumn('tenant_payment_logs', 'last_charge_date', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Last charge (nominal)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('tenant_payment_logs', 'billing_type');
    await queryInterface.removeColumn('tenant_payment_logs', 'billing_period');
    await queryInterface.removeColumn('tenant_payment_logs', 'billing_amount');
    await queryInterface.removeColumn('tenant_payment_logs', 'outstanding');
    await queryInterface.removeColumn('tenant_payment_logs', 'overdue');
    await queryInterface.removeColumn('tenant_payment_logs', 'rate');
    await queryInterface.removeColumn('tenant_payment_logs', 'last_charge_date');
  },
};
