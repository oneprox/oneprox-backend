'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Make amount nullable
    await queryInterface.changeColumn('tenant_payment_logs', 'amount', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });

    // Make payment_method nullable
    await queryInterface.changeColumn('tenant_payment_logs', 'payment_method', {
      type: Sequelize.ENUM('cash', 'bank_transfer', 'qris', 'other'),
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert amount to not null (but this might fail if there are null values)
    await queryInterface.changeColumn('tenant_payment_logs', 'amount', {
      type: Sequelize.FLOAT,
      allowNull: false,
    });

    // Revert payment_method to not null (but this might fail if there are null values)
    await queryInterface.changeColumn('tenant_payment_logs', 'payment_method', {
      type: Sequelize.ENUM('cash', 'bank_transfer', 'qris', 'other'),
      allowNull: false,
    });
  },
};
