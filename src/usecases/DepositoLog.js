class DepositoLogUsecase {
  constructor(depositoLogRepository, tenantRepository) {
    this.depositoLogRepository = depositoLogRepository;
    this.tenantRepository = tenantRepository;
  }

  _normalizeUuid(value) {
    return String(value || '').trim().toLowerCase();
  }

  _normalizeLogId(id) {
    const parsed = Number(id);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('Deposit log not found');
    }
    return parsed;
  }

  _normalizeAmount(value) {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount === 0) {
      throw new Error('amount must not be 0');
    }
    return amount;
  }

  async createDepositoLog(data, ctx) {
    try {
      ctx.log?.info(data, 'DepositoLogUsecase.createDepositoLog');

      const tenant = await this.tenantRepository.findById(data.tenant_id, ctx);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      const depositoLog = await this.depositoLogRepository.create({
        tenant_id: data.tenant_id,
        deposit_date: String(data.deposit_date).slice(0, 10),
        amount: this._normalizeAmount(data.amount),
        notes: data.notes || null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      }, ctx);

      return depositoLog;
    } catch (error) {
      ctx.log?.error({ data, error: error.message }, 'DepositoLogUsecase.createDepositoLog_error');
      throw error;
    }
  }

  async updateDepositoLog(id, tenantId, data, ctx) {
    try {
      const logId = this._normalizeLogId(id);
      ctx.log?.info({ id: logId, tenantId, data }, 'DepositoLogUsecase.updateDepositoLog');

      const depositoLog = await this.depositoLogRepository.findById(logId, ctx);
      if (
        !depositoLog ||
        this._normalizeUuid(depositoLog.tenant_id) !== this._normalizeUuid(tenantId)
      ) {
        throw new Error('Deposit log not found');
      }

      const updateData = {};
      if (data.deposit_date !== undefined) {
        updateData.deposit_date = String(data.deposit_date).slice(0, 10);
      }
      if (data.amount !== undefined) {
        updateData.amount = this._normalizeAmount(data.amount);
      }
      if (data.notes !== undefined) {
        updateData.notes = data.notes || null;
      }

      const updated = await this.depositoLogRepository.update(logId, updateData, ctx);
      return updated;
    } catch (error) {
      ctx.log?.error({ id, tenantId, data, error: error.message }, 'DepositoLogUsecase.updateDepositoLog_error');
      throw error;
    }
  }

  async getDepositoLogsByTenantId(tenantId, queryParams, ctx) {
    try {
      ctx.log?.info({ tenantId, queryParams }, 'DepositoLogUsecase.getDepositoLogsByTenantId');

      const tenant = await this.tenantRepository.findById(tenantId, ctx);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      return this.depositoLogRepository.findByTenantId(tenantId, queryParams, ctx);
    } catch (error) {
      ctx.log?.error({ tenantId, queryParams, error: error.message }, 'DepositoLogUsecase.getDepositoLogsByTenantId_error');
      throw error;
    }
  }

  async deleteDepositoLog(id, tenantId, ctx) {
    try {
      const logId = this._normalizeLogId(id);
      ctx.log?.info({ id: logId, tenantId }, 'DepositoLogUsecase.deleteDepositoLog');

      const depositoLog = await this.depositoLogRepository.findById(logId, ctx);
      if (!depositoLog) {
        // Idempotent: sudah terhapus di request sebelumnya
        return true;
      }
      if (this._normalizeUuid(depositoLog.tenant_id) !== this._normalizeUuid(tenantId)) {
        throw new Error('Deposit log not found');
      }

      await this.depositoLogRepository.delete(logId, ctx);
      return true;
    } catch (error) {
      ctx.log?.error({ id, tenantId, error: error.message }, 'DepositoLogUsecase.deleteDepositoLog_error');
      throw error;
    }
  }
}

module.exports = DepositoLogUsecase;
