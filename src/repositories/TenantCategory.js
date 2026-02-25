class TenantCategoryRepository {
  constructor(tenantCategoryModel) {
    this.tenantCategoryModel = tenantCategoryModel; 
  }

  async getByID(id) {
    return this.tenantCategoryModel.findOne({
      where: {id}
    })
  }

  async findByName(name, ctx = {}) {
    try {
      ctx.log?.info({ name }, 'TenantCategoryRepository.findByName');
      const category = await this.tenantCategoryModel.findOne({
        where: { name: name.trim() }
      });
      return category ? category.toJSON() : null;
    } catch (error) {
      ctx.log?.error({ name, error }, 'TenantCategoryRepository.findByName_error');
      throw error;
    }
  }

  async create(data, ctx = {}, tx = null) {
    try {
      ctx.log?.info(data, 'TenantCategoryRepository.create');
      const now = new Date();
      const category = await this.tenantCategoryModel.create({
        name: data.name.trim(),
        created_by: data.created_by || ctx.userId || null,
        updated_by: data.updated_by || ctx.userId || null,
        created_at: now,
        updated_at: now,
      }, { transaction: tx });
      return category.toJSON();
    } catch (error) {
      ctx.log?.error({ data, error }, 'TenantCategoryRepository.create_error');
      throw error;
    }
  }
}

module.exports = TenantCategoryRepository;