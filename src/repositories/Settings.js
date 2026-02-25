class SettingsRepository {
  constructor(settingsModel) {
    this.settingsModel = settingsModel;
  }

  async findAll(ctx = {}) {
    ctx.log?.info({}, 'repo_find_all_settings');
    const settings = await this.settingsModel.findAll({
      order: [['key', 'ASC']]
    });
    return settings.map(setting => setting.toJSON());
  }

  async findById(id, ctx = {}) {
    ctx.log?.debug({ id }, 'repo_find_setting_by_id');
    const setting = await this.settingsModel.findByPk(id);
    return setting ? setting.toJSON() : null;
  }

  async findByKey(key, ctx = {}) {
    ctx.log?.debug({ key }, 'repo_find_setting_by_key');
    const setting = await this.settingsModel.findOne({
      where: { key },
    });
    return setting ? setting.toJSON() : null;
  }

  async findByValue(value, ctx = {}) {
    ctx.log?.debug({ value }, 'repo_find_setting_by_value');
    const setting = await this.settingsModel.findOne({
      where: { value },
      order: [['created_at', 'DESC']],
    });
    return setting ? setting.toJSON() : null;
  }

  async findAllByValue(value, ctx = {}) {
    ctx.log?.debug({ value }, 'repo_find_all_settings_by_value');
    const settings = await this.settingsModel.findAll({
      where: { value },
      order: [['created_at', 'DESC']],
    });
    return settings.map(setting => setting.toJSON());
  }

  async create(settingData, ctx = {}, t = null) {
    ctx.log?.info({ key: settingData.key }, 'repo_create_setting');
    const setting = await this.settingsModel.create({
      key: settingData.key,
      value: settingData.value,
      description: settingData.description,
      created_by: settingData.created_by,
      updated_by: settingData.updated_by,
    }, { transaction: t });
    return setting.toJSON();
  }

  async update(id, settingData, ctx = {}, t = null) {
    ctx.log?.info({ id }, 'repo_update_setting');
    const setting = await this.settingsModel.findByPk(id, { transaction: t });
    if (!setting) return null;

    await setting.update({
      value: settingData.value !== undefined ? settingData.value : setting.value,
      description: settingData.description !== undefined ? settingData.description : setting.description,
      updated_by: settingData.updated_by,
      updated_at: new Date(),
    }, { transaction: t });

    return setting.toJSON();
  }

  async updateByKey(key, settingData, ctx = {}, t = null) {
    ctx.log?.info({ key }, 'repo_update_setting_by_key');
    const setting = await this.settingsModel.findOne({
      where: { key },
    }, { transaction: t });
    
    if (!setting) return null;

    await setting.update({
      value: settingData.value !== undefined ? settingData.value : setting.value,
      description: settingData.description !== undefined ? settingData.description : setting.description,
      updated_by: settingData.updated_by,
      updated_at: new Date(),
    }, { transaction: t });

    return setting.toJSON();
  }

  async delete(id, ctx = {}, t = null) {
    ctx.log?.info({ id }, 'repo_delete_setting');
    const deleted = await this.settingsModel.destroy({ 
      where: { id },
      transaction: t
    });
    return deleted > 0;
  }

  async deleteByKey(key, ctx = {}, t = null) {
    ctx.log?.info({ key }, 'repo_delete_setting_by_key');
    const deleted = await this.settingsModel.destroy({ 
      where: { key },
      transaction: t
    });
    return deleted > 0;
  }
}

module.exports = SettingsRepository;

