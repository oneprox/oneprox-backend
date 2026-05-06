'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Kolom ini sebelumnya sempat dipakai sebagai nominal (FLOAT).
    // Agar tidak gagal saat alter type ke DATE/TIMESTAMP, kita null-kan data lama.
    await queryInterface.sequelize.query(`
      UPDATE tenant_payment_logs
      SET last_charge_date = NULL
      WHERE last_charge_date IS NOT NULL
    `);

    await queryInterface.changeColumn('tenant_payment_logs', 'last_charge_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Last charge date'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Rollback: kembalikan ke FLOAT seperti definisi awal.
    await queryInterface.changeColumn('tenant_payment_logs', 'last_charge_date', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Last charge (nominal)'
    });
  },
};

