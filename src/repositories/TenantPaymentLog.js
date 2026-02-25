const { Sequelize, Op } = require('sequelize');

class TenantPaymentLogRepository {
  constructor(tenantPaymentLogModel, tenantModel, userModel) {
    this.tenantPaymentLogModel = tenantPaymentLogModel;
    this.tenantModel = tenantModel;
    this.userModel = userModel;
  }

  async create(data, ctx = {}, tx = null) {
    try {
      ctx.log?.info(data, 'TenantPaymentLogRepository.create');
      const now = new Date();
      const paymentLog = await this.tenantPaymentLogModel.create({
        tenant_id: data.tenant_id,
        amount: data.amount,
        paid_amount: data.paid_amount || null, // Can be null, will be filled when payment is made
        payment_date: data.payment_date || null, // Can be null, will be filled when payment is made
        payment_deadline: data.payment_deadline || null, // Payment deadline (optional)
        payment_method: data.payment_method,
        status: data.status !== undefined ? data.status : 0, // Default to 0 (unpaid) if not provided
        notes: data.notes || null,
        billing_type: data.billing_type || null,
        billing_period: data.billing_period || null,
        billing_amount: data.billing_amount || null,
        outstanding: data.outstanding || null,
        overdue: data.overdue || null,
        rate: data.rate !== undefined ? data.rate : 0.01,
        last_charge_date: data.last_charge_date || null,
        created_by: data.created_by || ctx.userId || null,
        updated_by: data.updated_by || ctx.userId || null,
        created_at: now,
        updated_at: now,
      }, { transaction: tx });
      return paymentLog.toJSON();
    } catch (error) {
      ctx.log?.error({ data, error }, 'TenantPaymentLogRepository.create_error');
      throw error;
    }
  }

  async findById(id, ctx = {}) {
    try {
      ctx.log?.info({ id }, 'TenantPaymentLogRepository.findById');
      const paymentLog = await this.tenantPaymentLogModel.findByPk(id, {
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
      if (!paymentLog) return null;
      return paymentLog.toJSON();
    } catch (error) {
      ctx.log?.error({ id, error }, 'TenantPaymentLogRepository.findById_error');
      throw error;
    }
  }

  async findByTenantId(tenantId, queryParams = {}, ctx = {}) {
    try {
      ctx.log?.info({ tenantId, queryParams }, 'TenantPaymentLogRepository.findByTenantId');
      const { limit = 10, offset = 0, orderBy = 'payment_date', order = 'DESC', status } = queryParams;
      
      // Build where clause
      const whereClause = { tenant_id: tenantId };
      
      // Add status filter if provided
      if (status !== undefined && status !== null && status !== '') {
        // Convert string status to integer if needed
        let statusInt = status;
        if (typeof status === 'string') {
          const { PaymentLogStatusStrToInt } = require('../models/TenantPaymentLog');
          statusInt = PaymentLogStatusStrToInt[status];
          if (statusInt === undefined) {
            // If string doesn't match, try parsing as integer
            statusInt = parseInt(status, 10);
            if (isNaN(statusInt)) {
              throw new Error(`Invalid status: ${status}. Must be 'unpaid', 'paid', 'expired', or 0, 1, 2`);
            }
          }
        }
        whereClause.status = statusInt;
      }
      
      // Build order clause: always sort by payment_date ASC first, then payment_deadline ASC
      // NULLS LAST ensures null payment_date values come after non-null values
      let orderClause = [
        Sequelize.literal(`payment_date ASC NULLS LAST`),
        ['payment_deadline', 'ASC']
      ];
      
      const { rows, count } = await this.tenantPaymentLogModel.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: orderClause,
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

      return {
        rows: rows.map(row => row.toJSON()),
        count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
    } catch (error) {
      ctx.log?.error({ tenantId, queryParams, error }, 'TenantPaymentLogRepository.findByTenantId_error');
      throw error;
    }
  }

  async update(id, data, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id, data }, 'TenantPaymentLogRepository.update');
      const updateData = {
        ...data,
        updated_at: new Date(),
        updated_by: data.updated_by || ctx.userId || null,
      };
      await this.tenantPaymentLogModel.update(updateData, {
        where: { id },
        transaction: tx
      });
      const paymentLog = await this.findById(id, ctx);
      return paymentLog;
    } catch (error) {
      ctx.log?.error({ id, data, error }, 'TenantPaymentLogRepository.update_error');
      throw error;
    }
  }

  async delete(id, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id }, 'TenantPaymentLogRepository.delete');
      await this.tenantPaymentLogModel.destroy({
        where: { id },
        transaction: tx
      });
      return true;
    } catch (error) {
      ctx.log?.error({ id, error }, 'TenantPaymentLogRepository.delete_error');
      throw error;
    }
  }

  /**
   * Find unpaid payment logs with a deadline between now and (now + days).
   * Intended for internal notification jobs.
   */
  async findUnpaidDueSoon({ days = 7, now = new Date() } = {}, ctx = {}) {
    try {
      const daysInt = Number(days);
      const safeDays = Number.isFinite(daysInt) && daysInt >= 0 ? daysInt : 7;
      const start = now;
      const end = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);

      ctx.log?.info({ days: safeDays, start, end }, 'TenantPaymentLogRepository.findUnpaidDueSoon');

      const rows = await this.tenantPaymentLogModel.findAll({
        where: {
          status: 0, // unpaid
          payment_deadline: { [Op.ne]: null, [Op.between]: [start, end] },
          reminder_sent_at: null,
        },
        order: [['payment_deadline', 'ASC']],
        include: [
          {
            model: this.tenantModel,
            as: 'tenant',
            attributes: ['id', 'name', 'code', 'user_id', 'payment_term'],
            include: [
              {
                model: this.userModel,
                as: 'user',
                attributes: ['id', 'name', 'email'],
                required: false,
              },
            ],
            required: false,
          },
        ],
      });

      return rows.map(r => r.toJSON());
    } catch (error) {
      ctx.log?.error({ error }, 'TenantPaymentLogRepository.findUnpaidDueSoon_error');
      throw error;
    }
  }

  /**
   * Find all unique tenant IDs that have unpaid payment logs
   * @param {Object} ctx - Context object with log
   * @returns {Promise<string[]>} - Array of unique tenant IDs
   */
  async findTenantIdsWithUnpaidLogs(ctx = {}) {
    try {
      ctx.log?.info({}, 'TenantPaymentLogRepository.findTenantIdsWithUnpaidLogs');

      const rows = await this.tenantPaymentLogModel.findAll({
        where: {
          status: 0, // unpaid
        },
        attributes: ['tenant_id'],
        raw: true,
      });

      // Get unique tenant IDs using Set
      const tenantIdsSet = new Set();
      for (const row of rows) {
        if (row.tenant_id) {
          tenantIdsSet.add(row.tenant_id);
        }
      }

      const tenantIds = Array.from(tenantIdsSet);

      ctx.log?.info({ count: tenantIds.length }, 'TenantPaymentLogRepository.findTenantIdsWithUnpaidLogs: Found tenant IDs');
      return tenantIds;
    } catch (error) {
      ctx.log?.error({ error }, 'TenantPaymentLogRepository.findTenantIdsWithUnpaidLogs_error');
      throw error;
    }
  }
}

module.exports = TenantPaymentLogRepository;

