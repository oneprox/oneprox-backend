const { Router } = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');
const { createResponse } = require('../services/response');
const { errorMessage } = require('../utils/errorMessage');

function InitTenantRouter(TenantUseCase, TenantPaymentLogUsecase, TenantLegalUsecase, DepositoLogUsecase) {
  const router = Router();

  router.use(authMiddleware, ensureRole);

  router.post(
    '/', 
    [
      body('name').isString().notEmpty(),
      body('tenant_identifications').notEmpty().isArray(),
      body('contract_documents').notEmpty().isArray(),
      body('contract_begin_at').notEmpty(),
      body('contract_end_at').notEmpty(),
      body('building_type').notEmpty().isIn(['unit', 'asset']).withMessage('building_type is required and must be either "unit" or "asset"'),
      body('unit_ids').optional().isArray(),
      body('asset_ids').optional().isArray(),
      body('payment_term').optional().isInt({ min: 0, max: 1 }).withMessage('payment_term must be 0 (year) or 1 (month)'),
      body('rent_price').optional().isFloat(),
      body('ppn').optional().isFloat({ min: 0 }).withMessage('ppn must be a number >= 0'),
      body('total_price').optional().isFloat({ min: 0 }).withMessage('total_price must be a number >= 0'),
      body('building_area').optional().isFloat({ min: 0 }).withMessage('building_area must be a positive number'),
      body('land_area').optional().isFloat({ min: 0 }).withMessage('land_area must be a positive number'),
      body('electricity_power').optional().isFloat({ min: 0 }).withMessage('electricity_power must be a positive number'),
      // user_id boleh kosong jika new_user disediakan
      body('user_id').optional().isString(),
      body('new_user').optional().isObject(),
      body('new_user.email').optional().isEmail(),
      body('new_user.password').optional().isString().notEmpty(),
      body('new_user.name').optional().isString().notEmpty(),
      body('new_user.roleId').optional(),
      body('new_user.role_id').optional(),
      body('new_user.phone').optional(),
      body('new_user.gender').optional(),
      body('category').isString().notEmpty().withMessage('category is required'),
      body('bank_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid bank id'),
      body('sub_category').optional().isString(),
      body('status').optional().isIn(['inactive', 'active', 'pending', 'expired', 'terminated', 'blacklisted', '0', '1', '2', '3', '4', '5']).withMessage('status must be one of: inactive, active, pending, expired, terminated, blacklisted, or 0, 1, 2, 3, 4, 5'),
    ],
    async (req, res) => {
    try {
      req.log?.info({ body: req.body }, "TenantRouter.createTenant");
      console.log("TenantRouter.createTenant - received body:", JSON.stringify(req.body, null, 2));
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
      
      // Validate that either unit_ids or asset_ids is provided based on building_type
      if (req.body.building_type === 'unit' && (!req.body.unit_ids || !Array.isArray(req.body.unit_ids) || req.body.unit_ids.length === 0)) {
        return res.status(400).json(createResponse(null, "unit_ids is required when building_type is 'unit'", 400, false, {}, { type: 'field', msg: 'unit_ids is required when building_type is unit', path: 'unit_ids' }));
      }
      if (req.body.building_type === 'asset' && (!req.body.asset_ids || !Array.isArray(req.body.asset_ids) || req.body.asset_ids.length === 0)) {
        return res.status(400).json(createResponse(null, "asset_ids is required when building_type is 'asset'", 400, false, {}, { type: 'field', msg: 'asset_ids is required when building_type is asset', path: 'asset_ids' }));
      }
      
      // Normalisasi: treat empty string as undefined sehingga ditangani di usecase
      if (req.body && typeof req.body.user_id === 'string' && req.body.user_id.trim() === '') {
        delete req.body.user_id;
      }
      const {
        name,
        tenant_identifications,
        contract_documents,
        unit_ids,
        asset_ids,
        contract_begin_at,
        contract_end_at,
        building_type,
        payment_term,
        rent_price,
        ppn,
        building_area,
        land_area,
        electricity_power,
        category,
        sub_category,
        bank_id,
        user_id,
        new_user,
        status,
      } = req.body;
      
      console.log("TenantRouter.createTenant - extracted user_id:", user_id);
      console.log("TenantRouter.createTenant - extracted new_user:", new_user);

      const tenant = await TenantUseCase.createTenant({
        name, tenant_identifications, contract_documents, contract_begin_at, contract_end_at, unit_ids, asset_ids, building_type, payment_term, rent_price, ppn, building_area, land_area, electricity_power, user_id, new_user, category, sub_category, bank_id, status, createdBy: req.auth.userId
      }, {userId: req.auth.userId, log: req.log});
      res.status(201).json(createResponse(tenant, "success", 201));
    } catch (err) {
      const msg = errorMessage(err, 'Gagal membuat tenant');
      console.error("TenantRouter.createTenant_error: " + msg);
      req.log?.error({ err: msg }, "TenantRouter.createTenant_error");
      res.status(400).json(createResponse(null, msg, 400, false, {}, { message: msg }));
    }
  });

  router.get('/', [
    query('payment_status').optional().isIn(['paid', 'scheduled', 'reminder_needed', 'overdue']).withMessage('payment_status must be one of: paid, scheduled, reminder_needed, overdue'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }

    let limit = req.query.limit ? parseInt(req.query.limit) : 10
    let offset = req.query.offset ? parseInt(req.query.offset) : 0

    req.query.limit = limit
    req.query.offset = offset
    try {
      req.log?.info(req.query, "TenantRouter.getTenants");
      const data = await TenantUseCase.getAllTenants(req.query, {log: req.log, userId: req.auth.userId});
      
      res.status(200).json(createResponse(data.tenants, "success", 200, true, {
        total: data.total,
        limit: limit,
        offset: offset
      }));
    } catch (err) {
      req.log?.error(req.query, `TenantRouter.getTenants_error: ${err.message}`);
      res.status(500).json(createResponse(null, "internal server error", 500, false, {}, err));
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      req.log?.info({tenant_id: req.params.id}, "TenantRouter.getTenant");
      const tenant = await TenantUseCase.getTenantById(req.params.id, {log: req.log, userId: req.auth.userId});
      if (!tenant) {
        return res.status(404).json(createResponse(null, "not found", 404));
      }
      res.status(200).json(createResponse(tenant, "success", 200));
    } catch (err) {
      req.log?.error({tenant_id: req.params.id}, `TenantRouter.getTenant_error: ${err.message}`);
      res.status(500).json(createResponse(null, "internal server error", 500));
    }
  });

  router.put('/:id', [
    body('bank_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid bank id'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));

    try {
      req.log?.info({ tenant_id: req.params.id, update_data: req.body }, "TenantRouter.updateTenant");
      const updated = await TenantUseCase.updateTenant(req.params.id, req.body, {log: req.log, userId: req.auth.userId});
      res.status(202).json(createResponse(updated, "success", 202));
    } catch (err) {
      const msg = errorMessage(
        err,
        err.statusCode === 400 ? 'Gagal memperbarui tenant' : 'internal server error'
      );
      req.log?.error(
        { tenant_id: req.params.id, update_data: req.body, err: msg },
        'TenantRouter.updateTenant_error'
      );
      const status = err.statusCode === 400 ? 400 : 500;
      res.status(status).json(createResponse(null, msg, status, false, {}, { message: msg }));
    }
  });

  router.delete('/:id', [
    param('id').isUUID().withMessage('ID must be a valid UUID')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ tenant_id: req.params.id }, "TenantRouter.deleteTenant");
      await TenantUseCase.deleteTenant(req.params.id, {log: req.log, userId: req.auth.userId});
      res.status(204).send();
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id }, `TenantRouter.deleteTenant_error: ${err.message}`);
      if (err.message === 'Tenant not found') {
        res.status(404).json(createResponse(null, "Tenant not found", 404));
      } else {
        res.status(500).json(createResponse(null, "Internal server error", 500));
      }
    }
  });

  router.get('/:id/logs', async (req, res) => {
    try {
      req.log?.info({ tenant_id: req.params.id }, "TenantRouter.getTenantLogs");
      const tenantLogs = await TenantUseCase.getTenantLogs(req.params.id, {
        userId: req.auth.userId,
        log: req.log
      })

      res.status(200).json(createResponse(tenantLogs, "success", 200, true, {
        total: tenantLogs.length,
        limit: tenantLogs.length,
        offset: 0
      }));
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id }, `TenantRouter.getTenantLogs_error: ${err.message}`);
      res.status(500).json(createResponse(null, "internal server error", 500))
    }
  });

  router.get('/:id/deposito-logs', [
    param('id').isUUID().withMessage('ID must be a valid UUID'),
    query('limit').optional().isInt({ min: 1 }).withMessage('limit must be a positive integer'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be a non-negative integer'),
    query('orderBy').optional().isIn(['deposit_date', 'amount', 'created_at']).withMessage('orderBy must be deposit_date, amount, or created_at'),
    query('order').optional().isIn(['ASC', 'DESC', 'asc', 'desc']).withMessage('order must be ASC or DESC'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }

    try {
      req.log?.info({ tenant_id: req.params.id, query: req.query }, "TenantRouter.getDepositoLogs");
      const result = await DepositoLogUsecase.getDepositoLogsByTenantId(req.params.id, {
        limit: req.query.limit || 10,
        offset: req.query.offset || 0,
        orderBy: req.query.orderBy || 'deposit_date',
        order: req.query.order || 'DESC',
      }, {
        userId: req.auth.userId,
        log: req.log,
      });

      res.status(200).json(createResponse(result.rows, "success", 200, true, {
        total: result.count,
        limit: result.limit,
        offset: result.offset,
      }));
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id }, `TenantRouter.getDepositoLogs_error: ${err.message}`);
      if (err.message === 'Tenant not found') {
        res.status(404).json(createResponse(null, "Tenant not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.post('/:id/deposito-logs', [
    param('id').isUUID().withMessage('ID must be a valid UUID'),
    body('deposit_date').isISO8601().withMessage('deposit_date must be a valid date'),
    body('amount')
      .isFloat()
      .withMessage('amount must be a number')
      .custom((value) => {
        const n = Number(value);
        if (Number.isNaN(n) || n === 0) {
          throw new Error('amount must not be 0');
        }
        return true;
      }),
    body('notes').optional().isString(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }

    try {
      req.log?.info({ tenant_id: req.params.id, body: req.body }, "TenantRouter.createDepositoLog");
      const depositoLog = await DepositoLogUsecase.createDepositoLog({
        tenant_id: req.params.id,
        deposit_date: req.body.deposit_date,
        amount: req.body.amount,
        notes: req.body.notes,
      }, {
        userId: req.auth.userId,
        log: req.log,
      });

      res.status(201).json(createResponse(depositoLog, "Deposit log created successfully", 201));
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id }, `TenantRouter.createDepositoLog_error: ${err.message}`);
      if (err.message === 'Tenant not found') {
        res.status(404).json(createResponse(null, "Tenant not found", 404));
      } else if (err.message === 'amount must not be 0') {
        res.status(400).json(createResponse(null, err.message, 400));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.put('/:id/deposito-logs/:logId', [
    param('id').isUUID().withMessage('Tenant ID must be a valid UUID'),
    param('logId').isInt({ min: 1 }).withMessage('Log ID must be a valid integer'),
    body('deposit_date').optional().isISO8601().withMessage('deposit_date must be a valid date'),
    body('amount')
      .optional()
      .isFloat()
      .withMessage('amount must be a number')
      .custom((value) => {
        const n = Number(value);
        if (Number.isNaN(n) || n === 0) {
          throw new Error('amount must not be 0');
        }
        return true;
      }),
    body('notes').optional().isString(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }

    try {
      req.log?.info({
        tenant_id: req.params.id,
        log_id: req.params.logId,
        body: req.body,
      }, "TenantRouter.updateDepositoLog");

      const updatedDepositoLog = await DepositoLogUsecase.updateDepositoLog(
        req.params.logId,
        req.params.id,
        req.body,
        {
          userId: req.auth.userId,
          log: req.log,
        }
      );

      res.status(200).json(createResponse(updatedDepositoLog, "Deposit log updated successfully", 200));
    } catch (err) {
      req.log?.error({
        tenant_id: req.params.id,
        log_id: req.params.logId,
      }, `TenantRouter.updateDepositoLog_error: ${err.message}`);

      if (err.message === 'Deposit log not found') {
        res.status(404).json(createResponse(null, "Deposit log not found", 404));
      } else if (err.message === 'amount must not be 0') {
        res.status(400).json(createResponse(null, err.message, 400));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.delete('/:id/deposito-logs/:logId', [
    param('id').isUUID().withMessage('Tenant ID must be a valid UUID'),
    param('logId').isInt({ min: 1 }).withMessage('Log ID must be a valid integer'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }

    try {
      req.log?.info({
        tenant_id: req.params.id,
        log_id: req.params.logId,
      }, "TenantRouter.deleteDepositoLog");

      await DepositoLogUsecase.deleteDepositoLog(req.params.logId, req.params.id, {
        userId: req.auth.userId,
        log: req.log,
      });

      res.status(200).json(createResponse(null, "Deposit log deleted successfully", 200));
    } catch (err) {
      req.log?.error({
        tenant_id: req.params.id,
        log_id: req.params.logId,
      }, `TenantRouter.deleteDepositoLog_error: ${err.message}`);

      if (err.message === 'Deposit log not found') {
        res.status(404).json(createResponse(null, "Deposit log not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  // Payment Log endpoints
  router.post('/:id/payments', [
    param('id').isUUID().withMessage('ID must be a valid UUID'),
    body('paid_amount').optional().isFloat({ min: 0 }).withMessage('paid_amount must be a valid number (>= 0)'),
    body('payment_date').optional().isISO8601().withMessage('payment_date must be a valid date'),
    body('payment_deadline').notEmpty().isISO8601().withMessage('payment_deadline is required and must be a valid date'),
    body('payment_method').optional().isIn(['cash', 'bank_transfer', 'qris','other']).withMessage('payment_method must be one of: cash, bank_transfer, qris, other'),
    body('notes').optional().isString(),
    body('billing_type').optional().isString().withMessage('billing_type must be a string'),
    body('billing_period').notEmpty().isString().withMessage('billing_period is required and must be a string'),
    body('amount').notEmpty().isFloat({ min: 0 }).withMessage('amount is required and must be a positive number'),
    body('ppn_percent').optional().isFloat({ min: 0 }).withMessage('ppn_percent must be a number >= 0'),
    body('ppn').optional().isFloat({ min: 0 }).withMessage('ppn must be a number >= 0'),
    body('billing_amount').optional().isFloat({ min: 0 }).withMessage('billing_amount must be a positive number'),
    body('outstanding')
      .customSanitizer(v => (v === '' ? null : v))
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('outstanding must be a positive number'),
    body('overdue')
      .customSanitizer(v => (v === '' ? null : v))
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('overdue must be a positive number'),
    body('rate').optional().isFloat({ min: 0 }).withMessage('rate must be a number >= 0'),
    body('last_charge_date').optional().isISO8601().withMessage('last_charge_date must be a valid date'),
    body('spk')
      .optional({ nullable: true })
      .custom((v) => v === null || v === undefined || typeof v === 'string')
      .withMessage('spk must be a string'),
    body('invoice_number')
      .optional({ nullable: true })
      .custom((v) => v === null || v === undefined || typeof v === 'string')
      .withMessage('invoice_number must be a string'),
    body('invoice_date')
      .optional({ nullable: true })
      .custom((v) => {
        if (v === null || v === undefined || v === '') return true;
        return !Number.isNaN(Date.parse(String(v)));
      })
      .withMessage('invoice_date must be a valid date'),
    body('pph')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || value === '') return true;
        const n = Number(value);
        return !Number.isNaN(n) && n >= 0;
      })
      .withMessage('pph must be a positive number'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ tenant_id: req.params.id, body: req.body }, "TenantRouter.createPaymentLog");
      const paymentLog = await TenantPaymentLogUsecase.createPaymentLog({
        tenant_id: req.params.id,
        paid_amount: req.body.paid_amount,
        payment_date: req.body.payment_date,
        payment_deadline: req.body.payment_deadline,
        payment_method: req.body.payment_method,
        notes: req.body.notes,
        billing_type: req.body.billing_type,
        billing_period: req.body.billing_period,
        amount: req.body.amount,
        ppn_percent: req.body.ppn_percent,
        ppn: req.body.ppn,
        billing_amount: req.body.billing_amount,
        outstanding: req.body.outstanding,
        overdue: req.body.overdue,
        rate: req.body.rate,
        last_charge_date: req.body.last_charge_date,
        spk: req.body.spk,
        invoice_number: req.body.invoice_number,
        invoice_date: req.body.invoice_date,
        pph: req.body.pph,
      }, {
        userId: req.auth.userId,
        log: req.log
      });

      res.status(201).json(createResponse(paymentLog, "Payment log created successfully", 201));
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id }, `TenantRouter.createPaymentLog_error: ${err.message}`);
      if (err.message === 'Tenant not found') {
        res.status(404).json(createResponse(null, "Tenant not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.get('/:id/payments', [
    param('id').isUUID().withMessage('ID must be a valid UUID'),
    query('status').optional().isIn(['unpaid', 'paid', 'expired', '0', '1', '2']).withMessage('status must be unpaid, paid, expired, or 0, 1, 2'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ tenant_id: req.params.id, query: req.query }, "TenantRouter.getPaymentLogs");
      const result = await TenantPaymentLogUsecase.getPaymentLogsByTenantId(req.params.id, {
        limit: req.query.limit || 10,
        offset: req.query.offset || 0,
        orderBy: req.query.orderBy || 'payment_date',
        order: req.query.order || 'DESC',
        status: req.query.status, // Filter by status (unpaid, paid, expired, or 0, 1, 2)
      }, {
        userId: req.auth.userId,
        log: req.log
      });

      res.status(200).json(createResponse(result.rows, "success", 200, true, {
        total: result.count,
        limit: result.limit,
        offset: result.offset
      }));
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id }, `TenantRouter.getPaymentLogs_error: ${err.message}`);
      if (err.message === 'Tenant not found') {
        res.status(404).json(createResponse(null, "Tenant not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.put('/:id/payments/:paymentId', [
    param('id').isUUID().withMessage('Tenant ID must be a valid UUID'),
    param('paymentId').isInt({ min: 1 }).withMessage('Payment ID must be a valid integer'),
    body('payment_method')
      .optional({ values: 'falsy' })
      .isIn(['cash', 'bank_transfer', 'qris', 'other'])
      .withMessage('payment_method must be one of: cash, bank_transfer, qris, other'),
    body('payment_date').optional().isISO8601().withMessage('payment_date must be a valid date'),
    body('paid_amount').optional().isFloat({ min: 0 }).withMessage('paid_amount must be a valid number (>= 0)'),
    body('notes').optional().isString(),
    body('billing_type').optional().isString().withMessage('billing_type must be a string'),
    body('billing_period').optional().isString().withMessage('billing_period must be a string'),
    body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be a positive number'),
    body('ppn_percent').optional().isFloat({ min: 0 }).withMessage('ppn_percent must be a number >= 0'),
    body('ppn').optional().isFloat({ min: 0 }).withMessage('ppn must be a number >= 0'),
    body('billing_amount').optional().isFloat({ min: 0 }).withMessage('billing_amount must be a positive number'),
    body('outstanding')
      .customSanitizer(v => (v === '' ? null : v))
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('outstanding must be a positive number'),
    body('overdue')
      .customSanitizer(v => (v === '' ? null : v))
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('overdue must be a positive number'),
    body('rate').optional().isFloat({ min: 0 }).withMessage('rate must be a number >= 0'),
    body('last_charge_date').optional().isISO8601().withMessage('last_charge_date must be a valid date'),
    body('spk')
      .optional({ nullable: true })
      .custom((v) => v === null || v === undefined || typeof v === 'string')
      .withMessage('spk must be a string'),
    body('invoice_number')
      .optional({ nullable: true })
      .custom((v) => v === null || v === undefined || typeof v === 'string')
      .withMessage('invoice_number must be a string'),
    body('invoice_date')
      .optional({ nullable: true })
      .custom((v) => {
        if (v === null || v === undefined || v === '') return true;
        return !Number.isNaN(Date.parse(String(v)));
      })
      .withMessage('invoice_date must be a valid date'),
    body('pph')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || value === '') return true;
        const n = Number(value);
        return !Number.isNaN(n) && n >= 0;
      })
      .withMessage('pph must be a positive number'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ 
        tenant_id: req.params.id, 
        payment_id: req.params.paymentId, 
        body: req.body 
      }, "TenantRouter.updatePaymentLog");
      
      const updatedPaymentLog = await TenantPaymentLogUsecase.updatePaymentLog(
        req.params.paymentId,
        {
          ...req.body,
        },
        {
          userId: req.auth.userId,
          log: req.log
        }
      );

      res.status(200).json(createResponse(updatedPaymentLog, "Payment log updated successfully", 200));
    } catch (err) {
      req.log?.error({ 
        tenant_id: req.params.id, 
        payment_id: req.params.paymentId 
      }, `TenantRouter.updatePaymentLog_error: ${err.message}`);
      
      if (err.message === 'Payment log not found') {
        res.status(404).json(createResponse(null, "Payment log not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.delete('/:id/payments/:paymentId', [
    param('id').isUUID().withMessage('Tenant ID must be a valid UUID'),
    param('paymentId').isInt({ min: 1 }).withMessage('Payment ID must be a valid integer'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ 
        tenant_id: req.params.id, 
        payment_id: req.params.paymentId 
      }, "TenantRouter.deletePaymentLog");
      
      await TenantPaymentLogUsecase.deletePaymentLog(
        req.params.paymentId,
        req.params.id,
        {
          userId: req.auth.userId,
          log: req.log
        }
      );

      res.status(200).json(createResponse(null, "Payment log deleted successfully", 200));
    } catch (err) {
      req.log?.error({ 
        tenant_id: req.params.id, 
        payment_id: req.params.paymentId 
      }, `TenantRouter.deletePaymentLog_error: ${err.message}`);
      
      if (err.message === 'Payment log not found') {
        res.status(404).json(createResponse(null, "Payment log not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  // Tenant Legal endpoints
  router.post('/:id/legals', [
    param('id').isUUID().withMessage('ID must be a valid UUID'),
    body('doc_type').isString().notEmpty().withMessage('doc_type is required'),
    body('due_date').optional().isISO8601().withMessage('due_date must be a valid date'),
    body('keterangan').optional().isString(),
    body('document_url').optional().isString(),
    body('status').optional().isIn(['belum_selesai', 'selesai']).withMessage('status must be either "belum_selesai" or "selesai"'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ tenant_id: req.params.id, body: req.body }, "TenantRouter.createTenantLegal");
      const tenantLegal = await TenantLegalUsecase.createTenantLegal({
        tenant_id: req.params.id,
        doc_type: req.body.doc_type,
        due_date: req.body.due_date,
        keterangan: req.body.keterangan,
        document_url: req.body.document_url,
        status: req.body.status || 'belum_selesai',
      }, {
        userId: req.auth.userId,
        log: req.log
      });

      res.status(201).json(createResponse(tenantLegal, "Tenant legal created successfully", 201));
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id }, `TenantRouter.createTenantLegal_error: ${err.message}`);
      if (err.message === 'Tenant not found') {
        res.status(404).json(createResponse(null, "Tenant not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.get('/:id/legals', [
    param('id').isUUID().withMessage('ID must be a valid UUID'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      if (!TenantLegalUsecase) {
        req.log?.error({ tenant_id: req.params.id }, "TenantRouter.getTenantLegals_error: TenantLegalUsecase is not defined");
        return res.status(500).json(createResponse(null, "TenantLegalUsecase is not initialized", 500));
      }
      
      req.log?.info({ tenant_id: req.params.id }, "TenantRouter.getTenantLegals");
      const result = await TenantLegalUsecase.getTenantLegalsByTenantId(req.params.id, {
        userId: req.auth.userId,
        log: req.log
      });

      res.status(200).json(createResponse(result, "success", 200));
    } catch (err) {
      req.log?.error({ tenant_id: req.params.id, error: err.message, stack: err.stack }, `TenantRouter.getTenantLegals_error: ${err.message}`);
      if (err.message === 'Tenant not found') {
        res.status(404).json(createResponse(null, "Tenant not found", 404));
      } else {
        res.status(500).json(createResponse(null, `internal server error: ${err.message}`, 500));
      }
    }
  });

  router.put('/:id/legals/:legalId', [
    param('id').isUUID().withMessage('Tenant ID must be a valid UUID'),
    param('legalId').isInt({ min: 1 }).withMessage('Legal ID must be a valid integer'),
    body('doc_type').optional().isString().notEmpty().withMessage('doc_type must be a non-empty string'),
    body('due_date').optional().isISO8601().withMessage('due_date must be a valid date'),
    body('keterangan').optional().isString(),
    body('document_url').optional().isString(),
    body('status').optional().isIn(['belum_selesai', 'selesai']).withMessage('status must be either "belum_selesai" or "selesai"'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ 
        tenant_id: req.params.id, 
        legal_id: req.params.legalId, 
        body: req.body 
      }, "TenantRouter.updateTenantLegal");
      
      const updatedTenantLegal = await TenantLegalUsecase.updateTenantLegal(
        req.params.legalId,
        req.body,
        {
          userId: req.auth.userId,
          log: req.log
        }
      );

      res.status(200).json(createResponse(updatedTenantLegal, "Tenant legal updated successfully", 200));
    } catch (err) {
      req.log?.error({ 
        tenant_id: req.params.id, 
        legal_id: req.params.legalId 
      }, `TenantRouter.updateTenantLegal_error: ${err.message}`);
      
      if (err.message === 'Tenant legal not found') {
        res.status(404).json(createResponse(null, "Tenant legal not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  router.delete('/:id/legals/:legalId', [
    param('id').isUUID().withMessage('Tenant ID must be a valid UUID'),
    param('legalId').isInt({ min: 1 }).withMessage('Legal ID must be a valid integer'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    try {
      req.log?.info({ 
        tenant_id: req.params.id, 
        legal_id: req.params.legalId 
      }, "TenantRouter.deleteTenantLegal");
      
      await TenantLegalUsecase.deleteTenantLegal(
        req.params.legalId,
        {
          userId: req.auth.userId,
          log: req.log
        }
      );

      res.status(200).json(createResponse(null, "Tenant legal deleted successfully", 200));
    } catch (err) {
      req.log?.error({ 
        tenant_id: req.params.id, 
        legal_id: req.params.legalId 
      }, `TenantRouter.deleteTenantLegal_error: ${err.message}`);
      
      if (err.message === 'Tenant legal not found') {
        res.status(404).json(createResponse(null, "Tenant legal not found", 404));
      } else {
        res.status(500).json(createResponse(null, "internal server error", 500));
      }
    }
  });

  return router;
}

module.exports = {InitTenantRouter};