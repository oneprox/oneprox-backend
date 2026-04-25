const { Op } = require("sequelize");

class TenantRepository {
  constructor(tenantModel, userModel, tenantCategoryModel) {
    this.tenantModel = tenantModel;
    this.userModel = userModel;
    this.tenantCategoryModel = tenantCategoryModel;
  }
  async create(data, tx = null, ctx) {
    try {
      ctx.log?.info(data, "TenantRepository.create");
      return this.tenantModel.create(data, { transaction: tx });
    } catch (error) {
      ctx.log?.error(data, "TenantRepository.create_error");
      throw new Error(`error create tenant. with err: ${error.message}`);
    }
  }

  async findById(id, ctx) {
    try {
      ctx.log?.info({tenant_id: id}, "TenantRepository.findById");
      const tenant = await this.tenantModel.findByPk(id, {
      include: [
        {
          model: this.userModel,
          as: "createdBy",
          attributes: ["id", "name", "email"],
        },
        {
          model: this.userModel,
          as: "user",
          attributes: ["id", "name", "email"],
        },
        {
          model: this.userModel,
          as: "updatedBy",
          attributes: ["id", "name", "email"],
        },
        {
          model: this.tenantCategoryModel,
          as: "category",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    });

    let result = tenant.toJSON();
    result.created_by = result.createdBy;
    result.updated_by = result.updatedBy;
    // Keep user_id for frontend
    // delete result.user_id
    delete result.createdBy;
    delete result.updatedBy;
    return result;
    } catch (error) {
      ctx.log?.error({tenant_id: id}, `TenantRepository.findById_error: ${error.message}`);
      throw error;
    }
  }

  async findAll(filter = {}, ctx) {
    try {
      let whereQuery = {};
      if (filter.name || filter.user_id || filter.status || filter.category_id || filter.category || filter.payment_status || filter.asset_id) {
        whereQuery.where = {};
        if (filter.name && filter.name.trim()) {
          whereQuery.where.name = {
            [Op.iLike]: `%${filter.name.trim()}%`,
          };
        }

        if (filter.user_id) {
          whereQuery.where.user_id = filter.user_id;
        }

        if (filter.status) {
          whereQuery.where.status = filter.status;
        }

        if (filter.payment_status) {
          whereQuery.where.payment_status = filter.payment_status;
        }

        // Filter tenant by asset via tenant_units -> units or tenant_assets
        if (filter.asset_id) {
          const [result] = await this.tenantModel.sequelize.query(
            `
            SELECT DISTINCT tenant_id
            FROM (
              SELECT tu.tenant_id
              FROM tenant_units tu
              INNER JOIN units u ON u.id = tu.unit_id
              WHERE u.asset_id = :assetId
              UNION
              SELECT ta.tenant_id
              FROM tenant_assets ta
              WHERE ta.asset_id = :assetId
            ) filtered_tenants
            `,
            {
              replacements: { assetId: filter.asset_id },
            }
          );

          const tenantIds = Array.isArray(result) ? result.map((row) => row.tenant_id) : [];
          whereQuery.where.id = {
            [Op.in]: tenantIds.length > 0 ? tenantIds : ['00000000-0000-0000-0000-000000000000'],
          };
        }

        // Support both 'category' and 'category_id' filter parameters
        if (filter.category_id || filter.category) {
          const categoryId = filter.category_id || filter.category;
          // Convert to integer if it's a string
          whereQuery.where.category_id = typeof categoryId === 'string' ? parseInt(categoryId, 10) : categoryId;
        }
      }

      whereQuery.include = [
        {
          model: this.userModel,
          as: 'createdBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: this.userModel,
          as: 'updatedBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: this.userModel,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: this.tenantCategoryModel,
          as: 'category',
          attributes: ['id', 'name'],
          required: false,
        },
      ]

      // Handle pagination
      if (filter.limit) {
        whereQuery.limit = parseInt(filter.limit);
      }
      if (filter.offset) {
        whereQuery.offset = parseInt(filter.offset);
      }

      // Handle sorting
      if (filter.order) {
        let order;
        switch (filter.order) {
          case "oldest":
            order = [["updated_at", "ASC"]];
            break;
          case "newest":
            order = [["updated_at", "DESC"]];
            break;
          case "a-z":
            order = [["name", "ASC"]];
            break;
          case "z-a":
            order = [["name", "DESC"]];
            break;
          default:
            break;
        }
        if (order) {
          whereQuery.order = order;
        }
      }

      const data = await this.tenantModel.findAndCountAll(whereQuery);
      return {
        tenants: data.rows.map(t => {
          let tenant = t.toJSON();
          tenant.created_by = tenant.createdBy;
          tenant.updated_by = tenant.updatedBy;

          delete tenant.createdBy;
          delete tenant.updatedBy;

          return tenant;
        }),
        total: data.count
      }
    } catch (error) {
      ctx.log?.error(filter, "TenantRepository.findAll_error");
      throw new Error(`error when get tenants. with err: ${error.message}`);
    }
  }

  async update(id, data) {
    const tenant = await this.tenantModel.findByPk(id);
    if (!tenant) return null;
    
    // Convert rent_duration_unit from string to integer if needed
    const updateData = { ...data };
    if (updateData.rent_duration_unit && typeof updateData.rent_duration_unit === 'string') {
      const { DurationUnit } = require('../models/Tenant');
      updateData.rent_duration_unit = DurationUnit[updateData.rent_duration_unit];
    }
    
    // Convert status from string to integer if needed
    if (updateData.status !== undefined && updateData.status !== null) {
      if (typeof updateData.status === 'string') {
        const { TenantStatusStrToInt } = require('../models/Tenant');
        updateData.status = TenantStatusStrToInt[updateData.status];
        if (updateData.status === undefined) {
          throw new Error(`Invalid status: ${data.status}. Must be 'inactive', 'active', 'pending', 'expired', 'terminated', or 'blacklisted'`);
        }
      }
      // If status is already an integer, use it directly
    }
    
    // Validate payment_status if provided (must be one of: 'paid', 'scheduled', 'reminder_needed', 'overdue')
    if (updateData.payment_status !== undefined && updateData.payment_status !== null) {
      const validPaymentStatuses = ['paid', 'scheduled', 'reminder_needed', 'overdue'];
      if (!validPaymentStatuses.includes(updateData.payment_status)) {
        throw new Error(`Invalid payment_status: ${updateData.payment_status}. Must be one of: ${validPaymentStatuses.join(', ')}`);
      }
    }
    
    // Ensure created_at is never changed and updated_at is always current
    delete updateData.created_at;
    updateData.updated_at = new Date();
    
    // Log the update data for debugging
    if (updateData.payment_status) {
      console.log(`[TenantRepository] Updating tenant ${id} payment_status to: ${updateData.payment_status}`);
    }
    
    await tenant.update(updateData);
    
    // Reload tenant to get the latest data
    await tenant.reload();
    
    // Convert status back to string for response
    const tenantJson = tenant.toJSON();
    if (tenantJson.status !== undefined && tenantJson.status !== null) {
      const { TenantStatusIntToStr } = require('../models/Tenant');
      tenantJson.status = TenantStatusIntToStr[tenantJson.status] || tenantJson.status;
    }
    
    // Log the result for debugging
    if (updateData.payment_status) {
      console.log(`[TenantRepository] Tenant ${id} payment_status after update: ${tenantJson.payment_status}`);
    }
    
    return tenantJson;
  }

  async delete(id, ctx) {
    try {
      ctx.log?.info({ tenant_id: id }, "TenantRepository.delete");
      
      const tenant = await this.tenantModel.findByPk(id, {
        transaction: ctx.transaction
      });
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      await tenant.destroy({
        transaction: ctx.transaction
      });
      return true;
    } catch (error) {
      ctx.log?.error({ tenant_id: id }, `TenantRepository.delete_error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = TenantRepository;
