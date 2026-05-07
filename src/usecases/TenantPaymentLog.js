const sequelize = require("../models/sequelize");
const { PaymentLogStatusIntToStr } = require("../models/TenantPaymentLog");
const { updateTenantPaymentStatus } = require("../routes/internal");

class TenantPaymentLogUsecase {
  constructor(tenantPaymentLogRepository, tenantRepository) {
    this.tenantPaymentLogRepository = tenantPaymentLogRepository;
    this.tenantRepository = tenantRepository;
  }

  async createPaymentLog(data, ctx) {
    try {
      ctx.log?.info(data, "TenantPaymentLogUsecase.createPaymentLog");
      
      // Verify tenant exists
      const tenant = await this.tenantRepository.findById(data.tenant_id, ctx);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Create payment log
      // billing_period, billing_amount, and payment_deadline are mandatory
      // payment_date, paid_amount can be null initially
      // Jika payment_date / paid_amount diisi saat create, status otomatis paid.
      const hasPaymentDate = data.payment_date != null;
      const paidAmount =
        data.paid_amount !== undefined && data.paid_amount !== null
          ? Number(data.paid_amount)
          : null;
      const isPaidByAmount = paidAmount !== null && !Number.isNaN(paidAmount) && paidAmount > 0;
      const shouldBePaid = hasPaymentDate || isPaidByAmount;

      // Backward-compatible: jika tidak ada paid_amount tapi ada payment_date, gunakan amount sebagai paid_amount.
      const paidAmountToSave =
        paidAmount !== null && !Number.isNaN(paidAmount)
          ? paidAmount
          : (hasPaymentDate ? (data.amount ?? null) : null);

      const paymentLog = await this.tenantPaymentLogRepository.create({
        tenant_id: data.tenant_id,
        amount: data.amount || null,
        paid_amount: paidAmountToSave,
        payment_date: data.payment_date || null, // Use provided payment_date or null
        payment_deadline: data.payment_deadline, // Payment deadline (mandatory)
        payment_method: data.payment_method || null,
        status: shouldBePaid ? 1 : 0, // 1 = paid, 0 = unpaid
        notes: data.notes || null,
        billing_type: data.billing_type || null,
        billing_period: data.billing_period, // Mandatory
        billing_amount: data.billing_amount, // Mandatory
        outstanding: data.outstanding || null,
        overdue: data.overdue || null,
        rate: data.rate !== undefined ? data.rate : 0.01,
        last_charge_date: data.last_charge_date || null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      }, ctx);

      // Convert status back to string for response
      if (paymentLog && paymentLog.status !== undefined) {
        paymentLog.status = PaymentLogStatusIntToStr[paymentLog.status] || paymentLog.status;
      }

      return paymentLog;
    } catch (error) {
      ctx.log?.error(
        { data, error: error.message },
        "TenantPaymentLogUsecase.createPaymentLog_error"
      );
      throw error;
    }
  }

  async updatePaymentLog(id, data, ctx) {
    try {
      ctx.log?.info({ id, data }, "TenantPaymentLogUsecase.updatePaymentLog");
      
      // Verify payment log exists
      const paymentLog = await this.tenantPaymentLogRepository.findById(id, ctx);
      if (!paymentLog) {
        throw new Error('Payment log not found');
      }

      // Convert status from string to integer if provided
      const updateData = { ...data };
      if (updateData.status && typeof updateData.status === 'string') {
        const { PaymentLogStatusStrToInt } = require("../models/TenantPaymentLog");
        updateData.status = PaymentLogStatusStrToInt[updateData.status];
        if (updateData.status === undefined) {
          throw new Error(`Invalid status: ${data.status}. Must be 'unpaid', 'paid', or 'expired'`);
        }
      }

      // Auto-derive payment status from paid_amount when explicitly provided:
      // paid_amount <= 0  => unpaid
      // paid_amount > 0   => paid
      if (updateData.paid_amount !== undefined && updateData.paid_amount !== null) {
        const paidAmountNumber = Number(updateData.paid_amount);
        if (!Number.isNaN(paidAmountNumber)) {
          updateData.status = paidAmountNumber > 0 ? 1 : 0;
          if (paidAmountNumber <= 0) {
            updateData.payment_date = null;
            updateData.payment_method = null;
            updateData.outstanding = null;
            updateData.overdue = null;
            updateData.rate = null;
            updateData.last_charge_date = null;
          }
        }
      }

      // Update payment log
      const updatedPaymentLog = await this.tenantPaymentLogRepository.update(id, {
        ...updateData,
        updated_by: ctx.userId,
      }, ctx);
      
      // Check if payment was marked as paid
      const isPaid = updatedPaymentLog.status === 1 || updateData.status === 1;
      
      ctx.log?.info({ 
        paymentLogId: id, 
        tenantId: paymentLog.tenant_id, 
        isPaid, 
        updatedStatus: updatedPaymentLog.status 
      }, "Payment log updated, checking if should update tenant status");
      
      // Update tenant payment_status when payment log changes
      if (paymentLog.tenant_id) {
        try {
          // Add a small delay to ensure database transaction is committed
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Update payment_status for this tenant
          const newStatus = await updateTenantPaymentStatus({
            tenantRepository: this.tenantRepository,
            tenantPaymentLogRepository: this.tenantPaymentLogRepository,
            tenantId: paymentLog.tenant_id,
            ctx
          });
          
          ctx.log?.info({ 
            tenantId: paymentLog.tenant_id, 
            newPaymentStatus: newStatus,
            paymentWasPaid: isPaid
          }, "Updated tenant payment_status");
        } catch (err) {
          ctx.log?.error({ 
            tenantId: paymentLog.tenant_id, 
            error: err.message,
            stack: err.stack 
          }, "Failed to update tenant payment_status");
          // Don't throw error, just log it
        }
      }
      
      // Convert status back to string for response
      if (updatedPaymentLog && updatedPaymentLog.status !== undefined) {
        updatedPaymentLog.status = PaymentLogStatusIntToStr[updatedPaymentLog.status] || updatedPaymentLog.status;
      }

      return updatedPaymentLog;
    } catch (error) {
      ctx.log?.error(
        { id, data, error: error.message },
        "TenantPaymentLogUsecase.updatePaymentLog_error"
      );
      throw error;
    }
  }

  async getPaymentLogsByTenantId(tenantId, queryParams, ctx) {
    try {
      ctx.log?.info({ tenantId, queryParams }, "TenantPaymentLogUsecase.getPaymentLogsByTenantId");
      
      // Verify tenant exists
      const tenant = await this.tenantRepository.findById(tenantId, ctx);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      const result = await this.tenantPaymentLogRepository.findByTenantId(tenantId, queryParams, ctx);
      return result;
    } catch (error) {
      ctx.log?.error(
        { tenantId, queryParams, error: error.message },
        "TenantPaymentLogUsecase.getPaymentLogsByTenantId_error"
      );
      throw error;
    }
  }

  async getPaymentLogById(id, ctx) {
    try {
      ctx.log?.info({ id }, "TenantPaymentLogUsecase.getPaymentLogById");
      const paymentLog = await this.tenantPaymentLogRepository.findById(id, ctx);
      return paymentLog;
    } catch (error) {
      ctx.log?.error(
        { id, error: error.message },
        "TenantPaymentLogUsecase.getPaymentLogById_error"
      );
      throw error;
    }
  }

  async deletePaymentLog(id, tenantId, ctx) {
    try {
      ctx.log?.info({ id, tenantId }, "TenantPaymentLogUsecase.deletePaymentLog");
      
      // Verify payment log exists
      const paymentLog = await this.tenantPaymentLogRepository.findById(id, ctx);
      if (!paymentLog) {
        throw new Error('Payment log not found');
      }
      if (tenantId && paymentLog.tenant_id !== tenantId) {
        throw new Error('Payment log not found');
      }

      await this.tenantPaymentLogRepository.delete(id, ctx);
      return true;
    } catch (error) {
      ctx.log?.error(
        { id, tenantId, error: error.message },
        "TenantPaymentLogUsecase.deletePaymentLog_error"
      );
      throw error;
    }
  }
}

module.exports = TenantPaymentLogUsecase;

