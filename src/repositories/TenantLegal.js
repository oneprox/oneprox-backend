class TenantLegalRepository {
  constructor(tenantLegalModel, tenantModel, userModel) {
    this.tenantLegalModel = tenantLegalModel;
    this.tenantModel = tenantModel;
    this.userModel = userModel;
  }

  async create(data, ctx = {}, tx = null) {
    try {
      ctx.log?.info(data, 'TenantLegalRepository.create');
      const now = new Date();
      const tenantLegal = await this.tenantLegalModel.create({
        tenant_id: data.tenant_id,
        doc_type: data.doc_type,
        due_date: data.due_date || null,
        keterangan: data.keterangan || null,
        document_url: data.document_url || null,
        status: data.status || 'belum_selesai',
        created_by: data.created_by || ctx.userId || null,
        updated_by: data.updated_by || ctx.userId || null,
        created_at: now,
        updated_at: now,
      }, { transaction: tx });
      return tenantLegal.toJSON();
    } catch (error) {
      ctx.log?.error({ data, error }, 'TenantLegalRepository.create_error');
      throw error;
    }
  }

  async findById(id, ctx = {}) {
    try {
      ctx.log?.info({ id }, 'TenantLegalRepository.findById');
      const tenantLegal = await this.tenantLegalModel.findByPk(id, {
        include: [
          {
            model: this.tenantModel,
            as: 'tenant',
            attributes: ['id', 'name', 'code']
          },
          {
            model: this.userModel,
            as: 'createdBy',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.userModel,
            as: 'updatedBy',
            attributes: ['id', 'name', 'email']
          }
        ]
      });
      if (!tenantLegal) return null;
      return tenantLegal.toJSON();
    } catch (error) {
      ctx.log?.error({ id, error }, 'TenantLegalRepository.findById_error');
      throw error;
    }
  }

  async findByTenantId(tenantId, ctx = {}) {
    try {
      ctx.log?.info({ tenantId }, 'TenantLegalRepository.findByTenantId');
      const tenantLegals = await this.tenantLegalModel.findAll({
        where: { tenant_id: tenantId },
        order: [['created_at', 'DESC']],
        include: [
          {
            model: this.userModel,
            as: 'createdBy',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.userModel,
            as: 'updatedBy',
            attributes: ['id', 'name', 'email']
          }
        ]
      });
      return tenantLegals.map(tl => tl.toJSON());
    } catch (error) {
      ctx.log?.error({ tenantId, error }, 'TenantLegalRepository.findByTenantId_error');
      throw error;
    }
  }

  async update(id, data, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id, data }, 'TenantLegalRepository.update');
      const updateData = {
        ...data,
        updated_at: new Date(),
        updated_by: data.updated_by || ctx.userId || null,
      };
      await this.tenantLegalModel.update(updateData, {
        where: { id },
        transaction: tx
      });
      const tenantLegal = await this.findById(id, ctx);
      return tenantLegal;
    } catch (error) {
      ctx.log?.error({ id, data, error }, 'TenantLegalRepository.update_error');
      throw error;
    }
  }

  async delete(id, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id }, 'TenantLegalRepository.delete');
      await this.tenantLegalModel.destroy({
        where: { id },
        transaction: tx
      });
      return true;
    } catch (error) {
      ctx.log?.error({ id, error }, 'TenantLegalRepository.delete_error');
      throw error;
    }
  }
}

module.exports = TenantLegalRepository;
