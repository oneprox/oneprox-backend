class BankUseCase {
  constructor(bankRepository) {
    this.bankRepository = bankRepository;
  }

  async listAllBanks(filter = {}, ctx = {}) {
    ctx.log?.info({ filter }, 'usecase_list_all_banks');
    try {
      const banks = await this.bankRepository.findAll(filter, ctx);
      return banks;
    } catch (error) {
      ctx.log?.error({ error: error.message }, 'usecase_list_all_banks_error');
      throw error;
    }
  }

  async getBankById(id, ctx = {}) {
    ctx.log?.info({ id }, 'usecase_get_bank_by_id');
    try {
      const bank = await this.bankRepository.findById(id, ctx);
      return bank;
    } catch (error) {
      ctx.log?.error({ error: error.message }, 'usecase_get_bank_by_id_error');
      throw error;
    }
  }

  async createBank(bankData, ctx = {}) {
    ctx.log?.info({ bankData }, 'usecase_create_bank');
    try {
      const bank = await this.bankRepository.create({
        ...bankData,
        created_by: ctx.userId,
      }, ctx);
      return bank;
    } catch (error) {
      ctx.log?.error({ error: error.message }, 'usecase_create_bank_error');
      throw error;
    }
  }

  async updateBank(id, bankData, ctx = {}) {
    ctx.log?.info({ id, bankData }, 'usecase_update_bank');
    try {
      const bank = await this.bankRepository.update(id, {
        ...bankData,
        updated_by: ctx.userId,
      }, ctx);
      return bank;
    } catch (error) {
      ctx.log?.error({ error: error.message }, 'usecase_update_bank_error');
      throw error;
    }
  }

  async deleteBank(id, ctx = {}) {
    ctx.log?.info({ id }, 'usecase_delete_bank');
    try {
      const deleted = await this.bankRepository.delete(id, ctx);
      return deleted;
    } catch (error) {
      ctx.log?.error({ error: error.message }, 'usecase_delete_bank_error');
      throw error;
    }
  }
}

module.exports = BankUseCase;
