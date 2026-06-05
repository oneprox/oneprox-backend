class TenantAttachmentRepositoy {
  constructor(tenantAttachmentModel) {
    this.tenantAttachmentModel = tenantAttachmentModel;
  }

  async create(data, tx = null, ctx) {
    try {
      ctx.log?.info(data, "TenantAttachmentRepository.create");
      return this.tenantAttachmentModel.create(data, {transaction: tx});
    } catch (error) {
      ctx.log?.error(data, "TenantAttachmentRepository.create_error");
      throw new Error(`error create tenant attachment. with err: ${error.message}`);
    }
  }

  async getByTenantID(tenantID) {
    return this.tenantAttachmentModel.findAll({
      where: { tenant_id: tenantID }
    });
  }

  async deleteByTenantId(tenantId, ctx) {
    try {
      ctx.log?.info({ tenant_id: tenantId }, "TenantAttachmentRepository.deleteByTenantId");
      const deleted = await this.tenantAttachmentModel.destroy({
        where: { tenant_id: tenantId },
        transaction: ctx.transaction
      });
      return deleted > 0;
    } catch (error) {
      ctx.log?.error({ tenant_id: tenantId }, `TenantAttachmentRepository.deleteByTenantId_error: ${error.message}`);
      throw error;
    }
  }

  async deleteByTenantIdAndType(tenantId, attachmentType, ctx = {}) {
    return this.tenantAttachmentModel.destroy({
      where: { tenant_id: tenantId, attachment_type: attachmentType },
      transaction: ctx.transaction,
    });
  }
}

module.exports = TenantAttachmentRepositoy;