'use strict';

/**
 * Non-routine user_tasks: start_at hanya diisi saat worker menekan Start.
 * Data lama (generator) sering mengisi start_at = hari jatuh tempo sementara status masih pending — dikosongkan.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE user_tasks
      SET start_at = NULL
      WHERE is_routine = false
        AND status = 0
        AND code IS NOT NULL
        AND code LIKE 'NR:%'
    `);
  },

  async down() {
    // Tidak bisa mengembalikan nilai start_at yang dihapus
  },
};
