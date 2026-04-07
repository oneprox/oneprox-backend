class TenantLegalUsecase {
  constructor(tenantLegalRepository, tenantRepository, settingsRepository) {
    this.tenantLegalRepository = tenantLegalRepository;
    this.tenantRepository = tenantRepository;
    this.settingsRepository = settingsRepository;
  }

  async createTenantLegal(data, ctx) {
    try {
      ctx.log?.info(data, "TenantLegalUsecase.createTenantLegal");
      
      // Verify tenant exists
      const tenant = await this.tenantRepository.findById(data.tenant_id, ctx);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Create tenant legal
      const tenantLegal = await this.tenantLegalRepository.create({
        tenant_id: data.tenant_id,
        doc_type: data.doc_type,
        due_date: data.due_date || null,
        keterangan: data.keterangan || null,
        document_url: data.document_url || null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      }, ctx);

      return tenantLegal;
    } catch (error) {
      ctx.log?.error(
        { data, error: error.message },
        "TenantLegalUsecase.createTenantLegal_error"
      );
      throw error;
    }
  }

  async updateTenantLegal(id, data, ctx) {
    try {
      ctx.log?.info({ id, data }, "TenantLegalUsecase.updateTenantLegal");
      
      // Verify tenant legal exists
      const tenantLegal = await this.tenantLegalRepository.findById(id, ctx);
      if (!tenantLegal) {
        throw new Error('Tenant legal not found');
      }

      // Update tenant legal
      const updatedTenantLegal = await this.tenantLegalRepository.update(id, {
        ...data,
        updated_by: ctx.userId,
      }, ctx);

      return updatedTenantLegal;
    } catch (error) {
      ctx.log?.error(
        { id, data, error: error.message },
        "TenantLegalUsecase.updateTenantLegal_error"
      );
      throw error;
    }
  }

  async getTenantLegalsByTenantId(tenantId, ctx) {
    try {
      ctx.log?.info({ tenantId }, "TenantLegalUsecase.getTenantLegalsByTenantId");
      
      // Verify tenant exists
      const tenant = await this.tenantRepository.findById(tenantId, ctx);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      const result = await this.tenantLegalRepository.findByTenantId(tenantId, ctx);
      
      // Add description from settings if available
      if (this.settingsRepository && result && Array.isArray(result)) {
        // Get all settings with value='legal_doc'
        const legalDocSettings = await this.settingsRepository.findAllByValue('legal_doc', ctx);
        
        // Map description to each legal document based on doc_type (key)
        const resultWithDescription = result.map(legal => {
          const matchingSetting = legalDocSettings.find(setting => setting.key === legal.doc_type);
          return {
            ...legal,
            description: matchingSetting?.description || null
          };
        });
        
        return resultWithDescription;
      }
      
      return result;
    } catch (error) {
      ctx.log?.error(
        { tenantId, error: error.message },
        "TenantLegalUsecase.getTenantLegalsByTenantId_error"
      );
      throw error;
    }
  }

  async getTenantLegalById(id, ctx) {
    try {
      ctx.log?.info({ id }, "TenantLegalUsecase.getTenantLegalById");
      const tenantLegal = await this.tenantLegalRepository.findById(id, ctx);
      return tenantLegal;
    } catch (error) {
      ctx.log?.error(
        { id, error: error.message },
        "TenantLegalUsecase.getTenantLegalById_error"
      );
      throw error;
    }
  }

  async deleteTenantLegal(id, ctx) {
    try {
      ctx.log?.info({ id }, "TenantLegalUsecase.deleteTenantLegal");
      
      // Verify tenant legal exists
      const tenantLegal = await this.tenantLegalRepository.findById(id, ctx);
      if (!tenantLegal) {
        throw new Error('Tenant legal not found');
      }

      await this.tenantLegalRepository.delete(id, ctx);
      return true;
    } catch (error) {
      ctx.log?.error(
        { id, error: error.message },
        "TenantLegalUsecase.deleteTenantLegal_error"
      );
      throw error;
    }
  }
}

module.exports = TenantLegalUsecase;
