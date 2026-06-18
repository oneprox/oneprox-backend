class DepositoLogRepository {
  constructor(depositoLogModel, userModel) {
    this.depositoLogModel = depositoLogModel;
    this.userModel = userModel;
  }

  _formatRow(row) {
    const depositoLog = row.toJSON ? row.toJSON() : { ...row };
    if (depositoLog.createdBy) {
      depositoLog.created_by = depositoLog.createdBy;
      delete depositoLog.createdBy;
    }
    if (depositoLog.updatedBy) {
      depositoLog.updated_by = depositoLog.updatedBy;
      delete depositoLog.updatedBy;
    }
    return depositoLog;
  }

  _userIncludes() {
    return [
      {
        model: this.userModel,
        as: 'createdBy',
        attributes: ['id', 'name', 'email'],
      },
      {
        model: this.userModel,
        as: 'updatedBy',
        attributes: ['id', 'name', 'email'],
      },
    ];
  }

  async create(data, ctx = {}, tx = null) {
    try {
      ctx.log?.info(data, 'DepositoLogRepository.create');
      const now = new Date();
      const depositoLog = await this.depositoLogModel.create({
        tenant_id: data.tenant_id,
        deposit_date: data.deposit_date,
        amount: data.amount,
        notes: data.notes || null,
        created_by: data.created_by || ctx.userId || null,
        created_at: now,
        updated_by: data.updated_by || ctx.userId || null,
        updated_at: now,
      }, {
        transaction: tx || ctx.transaction,
      });
      return this._formatRow(depositoLog);
    } catch (error) {
      ctx.log?.error({ data, error: error.message }, 'DepositoLogRepository.create_error');
      throw new Error(`error when create deposito log. with err: ${error.message}`);
    }
  }

  async findById(id, ctx = {}) {
    try {
      ctx.log?.info({ id }, 'DepositoLogRepository.findById');
      const depositoLog = await this.depositoLogModel.findByPk(id, {
        include: this._userIncludes(),
      });
      if (!depositoLog) return null;
      return this._formatRow(depositoLog);
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'DepositoLogRepository.findById_error');
      throw error;
    }
  }

  async findByTenantId(tenantId, queryParams = {}, ctx = {}) {
    try {
      ctx.log?.info({ tenant_id: tenantId, queryParams }, 'DepositoLogRepository.findByTenantId');
      const { limit = 10, offset = 0, orderBy = 'deposit_date', order = 'DESC' } = queryParams;

      const ALLOWED_ORDER_COLUMNS = ['deposit_date', 'amount', 'created_at', 'id'];
      const sortColumn = ALLOWED_ORDER_COLUMNS.includes(orderBy) ? orderBy : 'deposit_date';
      const sortDirection = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const { rows, count } = await this.depositoLogModel.findAndCountAll({
        where: { tenant_id: tenantId },
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        order: [[sortColumn, sortDirection], ['id', 'DESC']],
        include: this._userIncludes(),
      });

      return {
        rows: rows.map((row) => this._formatRow(row)),
        count,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      };
    } catch (error) {
      ctx.log?.error({ tenant_id: tenantId, error: error.message }, 'DepositoLogRepository.findByTenantId_error');
      throw error;
    }
  }

  async update(id, data, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id, data }, 'DepositoLogRepository.update');
      const updateData = {
        ...data,
        updated_at: new Date(),
        updated_by: data.updated_by || ctx.userId || null,
      };
      delete updateData.tenant_id;

      await this.depositoLogModel.update(updateData, {
        where: { id },
        transaction: tx || ctx.transaction,
      });
      return this.findById(id, ctx);
    } catch (error) {
      ctx.log?.error({ id, data, error: error.message }, 'DepositoLogRepository.update_error');
      throw error;
    }
  }

  async delete(id, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id }, 'DepositoLogRepository.delete');
      await this.depositoLogModel.destroy({
        where: { id },
        transaction: tx || ctx.transaction,
      });
      return true;
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'DepositoLogRepository.delete_error');
      throw error;
    }
  }
}

module.exports = DepositoLogRepository;
