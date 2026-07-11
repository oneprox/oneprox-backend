const { Router } = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');
const { createResponse } = require('../services/response');

function InitBankRouter(bankUsecase) {
  const router = Router();
  router.use(authMiddleware, ensureRole);

  // GET /api/banks - List all banks
  router.get(
    '/',
    [
      query('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
      query('bank_name').optional().isString().trim().withMessage('bank_name must be a string'),
      query('order').optional().isIn(['newest', 'oldest', 'a-z', 'z-a']).withMessage('order must be one of: newest, oldest, a-z, z-a'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
      query('offset').optional().isInt({ min: 0 }).withMessage('offset must be a non-negative integer'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      req.log?.info({ query: req.query }, 'route_banks_list');
      try {
        const filter = {};
        if (req.query.is_active !== undefined) {
          filter.is_active = req.query.is_active === 'true';
        }
        if (req.query.bank_name) {
          filter.bank_name = req.query.bank_name;
        }
        if (req.query.order) {
          filter.order = req.query.order;
        }
        if (req.query.limit) {
          filter.limit = parseInt(req.query.limit);
        }
        if (req.query.offset) {
          filter.offset = parseInt(req.query.offset);
        }

        const result = await bankUsecase.listAllBanks(filter, {
          requestId: req.requestId,
          log: req.log,
          userId: req.auth?.userId,
        });
        const pagination = result.total !== undefined ? {
          total: result.total,
          limit: result.limit || filter.limit || 10,
          offset: result.offset || filter.offset || 0
        } : {};
        return res.status(200).json(createResponse(result, "success", 200, true, pagination));
      } catch (error) {
        req.log?.error({ error: error.message, stack: error.stack }, 'route_banks_list_error');
        return res.status(500).json({
          message: 'Internal Server Error',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  );

  // GET /api/banks/:id - Get bank by ID
  router.get(
    '/:id',
    [param('id').isInt({ min: 1 }).withMessage('Invalid bank ID')],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      req.log?.info({ id: req.params.id }, 'route_banks_get');
      try {
        const bank = await bankUsecase.getBankById(req.params.id, {
          requestId: req.requestId,
          log: req.log,
          userId: req.auth?.userId,
        });
        if (!bank) return res.status(404).json({ message: 'Bank not found' });
        return res.json(bank);
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_banks_get_error');
        return res.status(500).json({ message: 'Internal Server Error' });
      }
    }
  );

  // POST /api/banks - Create new bank
  router.post(
    '/',
    [
      body('bank_name').isString().notEmpty().trim().withMessage('bank_name is required'),
      body('bank_account').isString().notEmpty().trim().withMessage('bank_account is required'),
      body('holder_name').isString().notEmpty().trim().withMessage('holder_name is required'),
      body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      req.log?.info({ bank_name: req.body.bank_name }, 'route_banks_create');
      try {
        const bank = await bankUsecase.createBank(req.body, {
          requestId: req.requestId,
          log: req.log,
          userId: req.auth?.userId,
        });
        return res.status(201).json(bank);
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_banks_create_error');
        return res.status(500).json({
          message: 'Internal Server Error',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  );

  // PUT /api/banks/:id - Update bank
  router.put(
    '/:id',
    [
      param('id').isInt({ min: 1 }).withMessage('Invalid bank ID'),
      body('bank_name').optional().isString().notEmpty().trim(),
      body('bank_account').optional().isString().notEmpty().trim(),
      body('holder_name').optional().isString().notEmpty().trim(),
      body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      req.log?.info({ id: req.params.id }, 'route_banks_update');
      try {
        const updatedBank = await bankUsecase.updateBank(
          req.params.id,
          req.body,
          {
            requestId: req.requestId,
            log: req.log,
            userId: req.auth?.userId,
          }
        );
        if (!updatedBank) return res.status(404).json({ message: 'Bank not found' });
        return res.json(updatedBank);
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_banks_update_error');
        return res.status(500).json({
          message: 'Internal Server Error',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  );

  // DELETE /api/banks/:id - Delete bank
  router.delete(
    '/:id',
    [param('id').isInt({ min: 1 }).withMessage('Invalid bank ID')],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      req.log?.info({ id: req.params.id }, 'route_banks_delete');
      try {
        const deleted = await bankUsecase.deleteBank(req.params.id, {
          requestId: req.requestId,
          log: req.log,
          userId: req.auth?.userId,
        });
        if (!deleted) return res.status(404).json({ message: 'Bank not found' });
        return res.status(204).send();
      } catch (error) {
        if (error.statusCode === 409) {
          return res.status(409).json({ message: error.message });
        }
        req.log?.error({ error: error.message }, 'route_banks_delete_error');
        return res.status(500).json({
          message: 'Internal Server Error',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  );

  return router;
}

module.exports = { InitBankRouter };
