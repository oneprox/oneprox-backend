'use strict';

const KEYS = ['impersonation_enabled'];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();
    const rows = [
      {
        key: 'impersonation_enabled',
        value: 'false',
        description: 'Izinkan super_admin "login sebagai" user lain untuk keperluan testing (true/false). Sesi berlaku 60 menit. Hanya super_admin yang dapat mengubah.',
        created_by: null,
        updated_by: null,
        created_at: now,
        updated_at: now,
      },
    ];

    // key unik: lewati jika sudah ada (aman dijalankan ulang)
    await queryInterface.bulkInsert('settings', rows, { ignoreDuplicates: true });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('settings', { key: { [Sequelize.Op.in]: KEYS } }, {});
  },
};
