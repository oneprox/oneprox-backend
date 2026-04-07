class TenantAssetRepository {
  constructor(tenantAssetModel) {
    this.tenantAssetModel = tenantAssetModel;
  }

  async create(data, tx, ctx) {
    try {
      ctx.log?.info(data, "TenantAssetRepository.create");
      return this.tenantAssetModel.create(data, {transaction: tx});
    } catch (error) {
      ctx.log?.error(data, "TenantAssetRepository.create_error");
      throw new Error(`error when create tenant asset. with err: ${error.message}`);
    }
  }

  async getByTenantID(id) {
    return this.tenantAssetModel.findAll({
      where: { tenant_id: id }
    })
  }

  async deleteByTenantId(tenantId, ctx) {
    try {
      ctx.log?.info({ tenant_id: tenantId }, "TenantAssetRepository.deleteByTenantId");
      const deleted = await this.tenantAssetModel.destroy({
        where: { tenant_id: tenantId },
        transaction: ctx.transaction
      });
      return deleted > 0;
    } catch (error) {
      ctx.log?.error({ tenant_id: tenantId }, `TenantAssetRepository.deleteByTenantId_error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = TenantAssetRepository;
