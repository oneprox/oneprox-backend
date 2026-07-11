class BankRepository {
  constructor(bankModel, tenantModel = null) {
    this.bankModel = bankModel;
    this.tenantModel = tenantModel;
  }

  async create(data, ctx = {}, tx = null) {
    try {
      ctx.log?.info(data, 'BankRepository.create');
      const bank = await this.bankModel.create(data, { transaction: tx });
      return bank.toJSON();
    } catch (error) {
      ctx.log?.error({ data, error }, 'BankRepository.create_error');
      throw error;
    }
  }

  async findById(id, ctx = {}) {
    try {
      ctx.log?.info({ id }, 'BankRepository.findById');
      const bank = await this.bankModel.findByPk(id);
      if (!bank) return null;
      return bank.toJSON();
    } catch (error) {
      ctx.log?.error({ id, error }, 'BankRepository.findById_error');
      throw error;
    }
  }

  async findAll(filter = {}, ctx = {}) {
    try {
      ctx.log?.info({ filter }, 'BankRepository.findAll');
      const { Op } = require('sequelize');

      const whereClause = {};

      if (filter.is_active !== undefined) {
        whereClause.is_active = filter.is_active;
      }
      if (filter.bank_name) {
        whereClause.bank_name = {
          [Op.iLike]: `%${filter.bank_name}%`
        };
      }

      const queryOptions = {
        where: whereClause,
      };

      let order;
      if (filter.order) {
        switch (filter.order) {
          case "oldest":
            order = [["updated_at", "ASC"]];
            break;
          case "newest":
            order = [["updated_at", "DESC"]];
            break;
          case "a-z":
            order = [["bank_name", "ASC"]];
            break;
          case "z-a":
            order = [["bank_name", "DESC"]];
            break;
          default:
            order = [["created_at", "DESC"]];
            break;
        }
        queryOptions.order = order;
      } else {
        queryOptions.order = [["created_at", "DESC"]];
      }

      if (filter.limit) {
        queryOptions.limit = parseInt(filter.limit);
      }
      if (filter.offset) {
        queryOptions.offset = parseInt(filter.offset);
      }

      const { count, rows } = await this.bankModel.findAndCountAll(queryOptions);

      const limit = filter.limit ? parseInt(filter.limit) : null;
      const offset = filter.offset ? parseInt(filter.offset) : 0;
      const totalPages = limit ? Math.ceil(count / limit) : 1;
      const currentPage = limit ? Math.floor(offset / limit) + 1 : 1;

      return {
        banks: rows.map(b => b.toJSON()),
        total: count,
        limit: limit,
        offset: offset,
        totalPages: totalPages,
        currentPage: currentPage
      };
    } catch (error) {
      ctx.log?.error({ filter, error }, 'BankRepository.findAll_error');
      throw error;
    }
  }

  async update(id, data, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id, data }, 'BankRepository.update');
      const updateData = {
        ...data,
        updated_at: new Date(),
      };
      await this.bankModel.update(updateData, {
        where: { id },
        transaction: tx
      });
      const bank = await this.findById(id, ctx);
      return bank;
    } catch (error) {
      ctx.log?.error({ id, data, error }, 'BankRepository.update_error');
      throw error;
    }
  }

  async delete(id, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id }, 'BankRepository.delete');
      if (this.tenantModel) {
        const referencedCount = await this.tenantModel.count({
          where: { bank_id: id },
          transaction: tx,
        });
        if (referencedCount > 0) {
          const err = new Error('Bank is still used by one or more tenants');
          err.statusCode = 409;
          throw err;
        }
      }
      const deletedCount = await this.bankModel.destroy({
        where: { id },
        transaction: tx
      });
      return deletedCount > 0;
    } catch (error) {
      ctx.log?.error({ id, error }, 'BankRepository.delete_error');
      throw error;
    }
  }
}

module.exports = BankRepository;
