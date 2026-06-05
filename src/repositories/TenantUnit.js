class TenantUnitRepository {
  constructor(tenantUnitModel) {
    this.tenantUnitModel = tenantUnitModel;
  }

  async create(data, tx, ctx) {
    try {
      ctx.log?.info(data, "TenantUnitRepository.create");
      return this.tenantUnitModel.create(data, {transaction: tx});
    } catch (error) {
      ctx.log?.error(data, "TenantUnitRepository.create_error");
      throw new Error(`error when create tenant unit. with err: ${error.message}`);
    }
  }

  async getByTenantID(id, transaction = null) {
    const options = { where: { tenant_id: id } };
    if (transaction) {
      options.transaction = transaction;
    }
    return this.tenantUnitModel.findAll(options);
  }

  /**
   * Tenant lain yang masih memegang unit (bukan inactive / terminated / blacklisted).
   * Mencakup tenant pending & aktif yang sudah punya relasi tenant_units.
   * @returns {string|null} tenant_id
   */
  /**
   * Unit ID yang masih ditahan tenant (bukan inactive / terminated / blacklisted).
   */
  async findHeldUnitIds(excludeTenantId = null) {
    const { QueryTypes } = require('sequelize');
    const replacements = {};
    let excludeSql = '';
    if (excludeTenantId) {
      excludeSql = 'AND t.id != :excludeTenantId';
      replacements.excludeTenantId = excludeTenantId;
    }
    const rows = await this.tenantUnitModel.sequelize.query(
      `
      SELECT DISTINCT tu.unit_id AS unit_id
      FROM tenant_units tu
      INNER JOIN tenants t ON t.id = tu.tenant_id
      WHERE t.status NOT IN (0, 4, 5)
      ${excludeSql}
      `,
      { replacements, type: QueryTypes.SELECT }
    );
    return rows.map((r) => r.unit_id).filter(Boolean);
  }

  async findHoldingTenantIdByUnitId(unitId, excludeTenantId = null) {
    const { QueryTypes } = require('sequelize');
    const replacements = { unitId };
    let excludeSql = '';
    if (excludeTenantId) {
      excludeSql = 'AND t.id != :excludeTenantId';
      replacements.excludeTenantId = excludeTenantId;
    }
    const rows = await this.tenantUnitModel.sequelize.query(
      `
      SELECT t.id AS tenant_id
      FROM tenant_units tu
      INNER JOIN tenants t ON t.id = tu.tenant_id
      WHERE tu.unit_id = :unitId
        AND t.status NOT IN (0, 4, 5)
        ${excludeSql}
      LIMIT 1
      `,
      { replacements, type: QueryTypes.SELECT }
    );
    return rows[0]?.tenant_id ?? null;
  }

  /**
   * Tenant aktif lain (status = 1) yang masih memegang unit ini.
   * @returns {string|null} tenant_id
   */
  /**
   * Semua tenant yang masih punya relasi tenant_units ke unit ini.
   * @returns {Array<{ id: string, name: string, code: string }>}
   */
  async findLinkedTenantsByUnitId(unitId) {
    const { QueryTypes } = require('sequelize');
    return this.tenantUnitModel.sequelize.query(
      `
      SELECT t.id, t.name, t.code
      FROM tenant_units tu
      INNER JOIN tenants t ON t.id = tu.tenant_id
      WHERE tu.unit_id = :unitId
      ORDER BY t.name ASC
      `,
      { replacements: { unitId }, type: QueryTypes.SELECT }
    );
  }

  async findActiveTenantIdByUnitId(unitId, excludeTenantId = null) {
    const { QueryTypes } = require('sequelize');
    const replacements = { unitId };
    let excludeSql = '';
    if (excludeTenantId) {
      excludeSql = 'AND t.id != :excludeTenantId';
      replacements.excludeTenantId = excludeTenantId;
    }
    const rows = await this.tenantUnitModel.sequelize.query(
      `
      SELECT t.id AS tenant_id
      FROM tenant_units tu
      INNER JOIN tenants t ON t.id = tu.tenant_id
      WHERE tu.unit_id = :unitId
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
      ctx.log?.info({ tenant_id: tenantId }, "TenantUnitRepository.deleteByTenantId");
      const deleted = await this.tenantUnitModel.destroy({
        where: { tenant_id: tenantId },
        transaction: ctx.transaction
      });
      return deleted > 0;
    } catch (error) {
      ctx.log?.error({ tenant_id: tenantId }, `TenantUnitRepository.deleteByTenantId_error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = TenantUnitRepository;
