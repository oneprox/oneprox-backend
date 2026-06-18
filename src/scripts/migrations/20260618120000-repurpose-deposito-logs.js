'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('deposito_logs', 'deposit_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('deposito_logs', 'amount', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('deposito_logs', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('deposito_logs', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('deposito_logs', 'updated_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.sequelize.query(`
      UPDATE deposito_logs
      SET
        amount = new_deposit - COALESCE(old_deposit, 0),
        deposit_date = CAST(created_at AS DATE),
        notes = reason
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM deposito_logs WHERE amount = 0 OR amount IS NULL
    `);

    await queryInterface.removeColumn('deposito_logs', 'old_deposit');
    await queryInterface.removeColumn('deposito_logs', 'new_deposit');
    await queryInterface.removeColumn('deposito_logs', 'reason');

    await queryInterface.changeColumn('deposito_logs', 'deposit_date', {
      type: Sequelize.DATEONLY,
      allowNull: false,
    });
    await queryInterface.changeColumn('deposito_logs', 'amount', {
      type: Sequelize.FLOAT,
      allowNull: false,
    });

    await queryInterface.addIndex('deposito_logs', ['deposit_date']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('deposito_logs', ['deposit_date']);

    await queryInterface.addColumn('deposito_logs', 'old_deposit', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('deposito_logs', 'new_deposit', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('deposito_logs', 'reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE deposito_logs
      SET new_deposit = amount, reason = notes
    `);

    await queryInterface.removeColumn('deposito_logs', 'deposit_date');
    await queryInterface.removeColumn('deposito_logs', 'amount');
    await queryInterface.removeColumn('deposito_logs', 'notes');
    await queryInterface.removeColumn('deposito_logs', 'updated_at');
    await queryInterface.removeColumn('deposito_logs', 'updated_by');
  },
};
