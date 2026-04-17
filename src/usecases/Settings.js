const sequelize = require('../models/sequelize');

class SettingsUsecase {
  constructor(settingsRepository, tenantRepository = null, tenantLegalRepository = null) {
    this.settingsRepository = settingsRepository;
    this.tenantRepository = tenantRepository;
    this.tenantLegalRepository = tenantLegalRepository;
  }

  async listAllSettings(ctx) {
    ctx.log?.info({}, 'usecase_list_all_settings');
    try {
      const settings = await this.settingsRepository.findAll(ctx);
      return settings;
    } catch (error) {
      ctx.log?.error({ error: error.message }, 'usecase_list_all_settings_error');
      throw new Error('Gagal mengambil daftar settings');
    }
  }

  async getSettingById(id, ctx) {
    ctx.log?.info({ id }, 'usecase_get_setting_by_id');
    try {
      const setting = await this.settingsRepository.findById(id, ctx);
      if (!setting) {
        throw new Error('Setting tidak ditemukan');
      }
      return setting;
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'usecase_get_setting_by_id_error');
      throw error;
    }
  }

  async getSettingByKey(key, ctx) {
    ctx.log?.info({ key }, 'usecase_get_setting_by_key');
    try {
      const setting = await this.settingsRepository.findByKey(key, ctx);
      return setting;
    } catch (error) {
      ctx.log?.error({ key, error: error.message }, 'usecase_get_setting_by_key_error');
      throw new Error('Gagal mengambil setting');
    }
  }

  async createSetting(data, ctx) {
    ctx.log?.info({ key: data.key }, 'usecase_create_setting');
    try {
      // Check if key already exists
      const existing = await this.settingsRepository.findByKey(data.key, ctx);
      if (existing) {
        throw new Error('Setting dengan key tersebut sudah ada');
      }

      const result = await sequelize.transaction(async (t) => {
        const settingData = {
          key: data.key,
          value: data.value,
          description: data.description,
          created_by: ctx.userId,
          updated_by: ctx.userId,
        };
        const setting = await this.settingsRepository.create(settingData, ctx, t);

        if (data.value === 'legal_doc' && this.tenantRepository && this.tenantLegalRepository) {
          const tenantResult = await this.tenantRepository.findAll({}, ctx);
          const tenants = Array.isArray(tenantResult?.tenants) ? tenantResult.tenants : [];

          for (const tenant of tenants) {
            await this.tenantLegalRepository.create({
              tenant_id: tenant.id,
              doc_type: data.key,
              due_date: null,
              keterangan: data.description || null,
              document_url: null,
              status: 'belum_selesai',
              created_by: ctx.userId,
              updated_by: ctx.userId,
            }, { ...ctx, transaction: t }, t);
          }
        }

        return setting;
      });

      return result;
    } catch (error) {
      ctx.log?.error({ key: data.key, error: error.message }, 'usecase_create_setting_error');
      throw error;
    }
  }

  async updateSetting(id, data, ctx) {
    ctx.log?.info({ id }, 'usecase_update_setting');
    try {
      const result = await sequelize.transaction(async (t) => {
        const settingData = {
          value: data.value,
          description: data.description,
          updated_by: ctx.userId,
        };
        const setting = await this.settingsRepository.update(id, settingData, ctx, t);
        if (!setting) {
          throw new Error('Setting tidak ditemukan');
        }
        return setting;
      });

      return result;
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'usecase_update_setting_error');
      throw error;
    }
  }

  async updateSettingByKey(key, data, ctx) {
    ctx.log?.info({ key }, 'usecase_update_setting_by_key');
    try {
      const result = await sequelize.transaction(async (t) => {
        // Check if setting exists
        let setting = await this.settingsRepository.findByKey(key, ctx);
        
        if (!setting) {
          // Create new setting if not found (upsert behavior)
          const settingData = {
            key: key,
            value: data.value,
            description: data.description,
            created_by: ctx.userId,
            updated_by: ctx.userId,
          };
          setting = await this.settingsRepository.create(settingData, ctx, t);
        } else {
          // Update existing setting
          const settingData = {
            value: data.value,
            description: data.description,
            updated_by: ctx.userId,
          };
          setting = await this.settingsRepository.updateByKey(key, settingData, ctx, t);
        }
        
        return setting;
      });

      return result;
    } catch (error) {
      ctx.log?.error({ key, error: error.message }, 'usecase_update_setting_by_key_error');
      throw error;
    }
  }

  async deleteSetting(id, ctx) {
    ctx.log?.info({ id }, 'usecase_delete_setting');
    try {
      const result = await sequelize.transaction(async (t) => {
        const deleted = await this.settingsRepository.delete(id, ctx, t);
        if (!deleted) {
          throw new Error('Setting tidak ditemukan');
        }
        return { success: true };
      });

      return result;
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'usecase_delete_setting_error');
      throw error;
    }
  }

}

module.exports = SettingsUsecase;

