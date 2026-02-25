'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add status column to tenant_legals table
    await queryInterface.addColumn('tenant_legals', 'status', {
      type: Sequelize.ENUM('belum_selesai', 'selesai'),
      allowNull: false,
      defaultValue: 'belum_selesai',
      comment: 'Status dokumen: belum_selesai, selesai'
    });

    // Add index on status for better query performance
    await queryInterface.addIndex('tenant_legals', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index first
    try {
      await queryInterface.removeIndex('tenant_legals', ['status']);
    } catch (error) {
      // Index might not exist, ignore error
    }
    
    // Remove status column
    await queryInterface.removeColumn('tenant_legals', 'status');
  },
};
