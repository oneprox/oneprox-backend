'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tenant_legals', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'tenants',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      doc_type: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Jenis dokumen legal'
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Tanggal jatuh tempo dokumen'
      },
      keterangan: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Keterangan dokumen'
      },
      document_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL dokumen yang diupload'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add indexes
    await queryInterface.addIndex('tenant_legals', ['tenant_id']);
    await queryInterface.addIndex('tenant_legals', ['due_date']);
    await queryInterface.addIndex('tenant_legals', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tenant_legals');
  },
};
