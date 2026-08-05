'use strict';

/**
 * `findDailyStatusByUserId` menyaring dengan
 * `created_at BETWEEN .. OR start_at BETWEEN .. OR completed_at BETWEEN ..`.
 * Karena klausanya OR (bukan AND), index komposit tidak terpakai — dibutuhkan
 * satu index per kolom supaya planner bisa menggabungkannya
 * (BitmapOr di Postgres, index_merge di MySQL).
 *
 * Migration ini murni menambah index: tidak ada kolom yang berubah dan tidak
 * ada baris yang disentuh. Data lama otomatis ikut ter-index saat dibangun.
 *
 * `CREATE INDEX` biasa mengunci INSERT/UPDATE/DELETE pada `user_tasks` selama
 * index dibangun. Di Postgres dipakai CONCURRENTLY supaya penulisan tetap jalan
 * — aman karena scripts/runMigrations.js memanggil `up()` di luar transaksi.
 * MySQL 5.6+ sudah memakai online DDL untuk ADD INDEX, jadi tidak perlu flag.
 */
const INDEXES = [
  { name: 'user_tasks_created_at_idx', fields: ['created_at'] },
  { name: 'user_tasks_start_at_idx', fields: ['start_at'] },
  { name: 'user_tasks_completed_at_idx', fields: ['completed_at'] },
];

module.exports = {
  up: async (queryInterface) => {
    const concurrently = queryInterface.sequelize.getDialect() === 'postgres';
    for (const index of INDEXES) {
      await queryInterface.addIndex('user_tasks', index.fields, {
        name: index.name,
        concurrently,
      });
    }
  },

  down: async (queryInterface) => {
    const concurrently = queryInterface.sequelize.getDialect() === 'postgres';
    for (const index of [...INDEXES].reverse()) {
      await queryInterface.removeIndex('user_tasks', index.name, { concurrently });
    }
  },
};
