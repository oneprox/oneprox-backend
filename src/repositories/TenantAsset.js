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

  /**
   * Tenant aktif lain (status = 1) yang masih memegang asset ini.
   * @returns {string|null} tenant_id
   */
  /**
   * Tenant yang terhubung langsung lewat tenant_assets.
   * @returns {Array<{ id: string, name: string, code: string }>}
   */
  async findLinkedTenantsByAssetId(assetId) {
    const { QueryTypes } = require('sequelize');
    return this.tenantAssetModel.sequelize.query(
      `
      SELECT t.id, t.name, t.code
      FROM tenant_assets ta
      INNER JOIN tenants t ON t.id = ta.tenant_id
      WHERE ta.asset_id = :assetId
      ORDER BY t.name ASC
      `,
      { replacements: { assetId }, type: QueryTypes.SELECT }
    );
  }

  /**
   * Tenant yang terhubung lewat unit di bawah asset ini.
   * @returns {Array<{ id: string, name: string, code: string }>}
   */
  async findLinkedTenantsByAssetUnits(assetId) {
    const { QueryTypes } = require('sequelize');
    return this.tenantAssetModel.sequelize.query(
      `
      SELECT DISTINCT t.id, t.name, t.code
      FROM tenant_units tu
      INNER JOIN tenants t ON t.id = tu.tenant_id
      INNER JOIN units u ON u.id = tu.unit_id
      WHERE u.asset_id = :assetId
      ORDER BY t.name ASC
      `,
      { replacements: { assetId }, type: QueryTypes.SELECT }
    );
  }

  async findActiveTenantIdByAssetId(assetId, excludeTenantId = null) {
    const { QueryTypes } = require('sequelize');
    const replacements = { assetId };
    let excludeSql = '';
    if (excludeTenantId) {
      excludeSql = 'AND t.id != :excludeTenantId';
      replacements.excludeTenantId = excludeTenantId;
    }
    const rows = await this.tenantAssetModel.sequelize.query(
      `
      SELECT t.id AS tenant_id
      FROM tenant_assets ta
      INNER JOIN tenants t ON t.id = ta.tenant_id
      WHERE ta.asset_id = :assetId
        AND t.status = 1
        ${excludeSql}
      LIMIT 1
      `,
      { replacements, type: QueryTypes.SELECT }
    );
    return rows[0]?.tenant_id ?? null;
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
