const sequelize = require("../models/sequelize");
const { PaymentLogStatusIntToStr } = require("../models/TenantPaymentLog");
const { updateTenantPaymentStatus } = require("../routes/internal");
const { normalizePaymentBillingFields } = require("../utils/paymentBilling");
const {
  ensureTenantAccessible,
  assertCanWriteTenantData,
} = require("../utils/tenantAccess");

class TenantPaymentLogUsecase {
  constructor(tenantPaymentLogRepository, tenantRepository) {
    this.tenantPaymentLogRepository = tenantPaymentLogRepository;
    this.tenantRepository = tenantRepository;
  }

  async createPaymentLog(data, ctx) {
    try {
      ctx.log?.info(data, "TenantPaymentLogUsecase.createPaymentLog");
      assertCanWriteTenantData(ctx);
      
      // Verify tenant exists dan boleh diakses oleh pemanggil
      const tenant = await ensureTenantAccessible(
        this.tenantRepository,
        data.tenant_id,
        ctx
      );

      // Create payment log
      // billing_period, billing_amount, and payment_deadline are mandatory
      // payment_date, paid_amount can be null initially
      // Jika payment_date / paid_amount diisi saat create, status otomatis paid.
      const paidAmountRaw =
        data.paid_amount !== undefined && data.paid_amount !== null
          ? Number(data.paid_amount)
          : null;
      const isPaidByAmount =
        paidAmountRaw !== null && !Number.isNaN(paidAmountRaw) && paidAmountRaw > 0;
      const shouldBePaid = isPaidByAmount;

      const paidAmountToSave =
        paidAmountRaw !== null && !Number.isNaN(paidAmountRaw)
          ? paidAmountRaw
          : null;

      const billingFields = normalizePaymentBillingFields(data);

      const paymentLog = await this.tenantPaymentLogRepository.create({
        tenant_id: data.tenant_id,
        amount: billingFields.amount,
        paid_amount: paidAmountToSave,
        payment_date: data.payment_date || null, // Use provided payment_date or null
        payment_deadline: data.payment_deadline, // Payment deadline (mandatory)
        payment_method: data.payment_method || null,
        status: shouldBePaid ? 1 : 0, // 1 = paid, 0 = unpaid
        notes: data.notes || null,
        billing_type: data.billing_type || null,
        billing_period: data.billing_period, // Mandatory
        billing_amount: billingFields.billing_amount,
        ppn: billingFields.ppn,
        ppn_percent: billingFields.ppn_percent,
        outstanding: data.outstanding || null,
        overdue: data.overdue || null,
        rate: data.rate !== undefined ? data.rate : 0.01,
        last_charge_date: data.last_charge_date || null,
        spk: data.spk != null && String(data.spk).trim() !== '' ? String(data.spk).trim() : null,
        invoice_number: data.invoice_number != null && String(data.invoice_number).trim() !== '' ? String(data.invoice_number).trim() : null,
        invoice_date: data.invoice_date ? String(data.invoice_date).slice(0, 10) : null,
        pph: data.pph !== undefined && data.pph !== null && !Number.isNaN(Number(data.pph)) ? Number(data.pph) : null,
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
      assertCanWriteTenantData(ctx);
      
      // Verify payment log exists
      const paymentLog = await this.tenantPaymentLogRepository.findById(id, ctx);
      if (!paymentLog) {
        throw new Error('Payment log not found');
      }
      await ensureTenantAccessible(
        this.tenantRepository,
        paymentLog.tenant_id,
        ctx,
        'Payment log not found'
      );

      // Convert status from string to integer if provided
      const updateData = { ...data };
      if (updateData.status && typeof updateData.status === 'string') {
        const { PaymentLogStatusStrToInt } = require("../models/TenantPaymentLog");
        updateData.status = PaymentLogStatusStrToInt[updateData.status];
        if (updateData.status === undefined) {
          throw new Error(`Invalid status: ${data.status}. Must be 'unpaid', 'paid', or 'expired'`);
        }
      }

      // Auto-derive payment status dari paid_amount bila field ikut di-update:
      // paid_amount null / 0 / <= 0  => unpaid + bersihkan field pelunasan
      // paid_amount > 0               => paid
      if (updateData.paid_amount !== undefined) {
        const raw = updateData.paid_amount;
        const paidAmountNumber =
          raw === null || raw === '' ? 0 : Number(raw);
        if (!Number.isNaN(paidAmountNumber)) {
          updateData.status = paidAmountNumber > 0 ? 1 : 0;
          updateData.paid_amount = paidAmountNumber > 0 ? paidAmountNumber : null;
          if (paidAmountNumber <= 0) {
            updateData.payment_date = null;
            // Hanya kosongkan metode pembayaran jika tidak dikirim eksplisit di request.
            if (data.payment_method === undefined) {
              updateData.payment_method = null;
            }
            // outstanding, overdue, rate, last_charge_date: biarkan nilai dari body;
            // jangan di-null otomatis agar update rate/penagihan saat unpaid tetap tersimpan.
          }
        }
      }

      const billingPatchKeys = ['amount', 'ppn_percent', 'ppn', 'billing_amount'];
      const touchesBilling = billingPatchKeys.some((k) => updateData[k] !== undefined);
      if (touchesBilling) {
        const merged = {
          amount: updateData.amount !== undefined ? updateData.amount : paymentLog.amount,
          ppn_percent:
            updateData.ppn_percent !== undefined ? updateData.ppn_percent : paymentLog.ppn_percent,
          ppn: updateData.ppn !== undefined ? updateData.ppn : paymentLog.ppn,
          billing_amount:
            updateData.billing_amount !== undefined
              ? updateData.billing_amount
              : paymentLog.billing_amount,
        };
        const billingFields = normalizePaymentBillingFields(merged);
        updateData.amount = billingFields.amount;
        updateData.ppn_percent = billingFields.ppn_percent;
        updateData.ppn = billingFields.ppn;
        updateData.billing_amount = billingFields.billing_amount;
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
      
      // Verify tenant exists dan boleh diakses oleh pemanggil
      await ensureTenantAccessible(this.tenantRepository, tenantId, ctx);

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
      assertCanWriteTenantData(ctx);
      
      // Verify payment log exists
      const paymentLog = await this.tenantPaymentLogRepository.findById(id, ctx);
      if (!paymentLog) {
        throw new Error('Payment log not found');
      }
      if (tenantId && paymentLog.tenant_id !== tenantId) {
        throw new Error('Payment log not found');
      }
      await ensureTenantAccessible(
        this.tenantRepository,
        paymentLog.tenant_id,
        ctx,
        'Payment log not found'
      );

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

