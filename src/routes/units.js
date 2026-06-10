const { Router } = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');
const { createResponse } = require('../services/response');

const UNIT_STATUS_INPUT_MAP = {
  available: 'available',
  occupied: 'occupied',
  maintenance: 'maintenance',
  reserved: 'reserved',
  inactive: 'inactive',
  out_of_order: 'out_of_order',
  0: 'available',
  1: 'occupied',
  2: 'maintenance',
  3: 'reserved',
  4: 'inactive',
  5: 'out_of_order',
  '0': 'available',
  '1': 'occupied',
  '2': 'maintenance',
  '3': 'reserved',
  '4': 'inactive',
  '5': 'out_of_order',
};

function normalizeUnitStatusInput(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const key = String(value).trim().toLowerCase();
  return UNIT_STATUS_INPUT_MAP[key] ?? UNIT_STATUS_INPUT_MAP[value];
}

function InitUnitRouter(UnitUsecase) {
  const router = Router();

  router.use(authMiddleware, ensureRole);

  router.post(
    '/',
    [
      body('name').isString().notEmpty(),
      body('asset_id').isUUID().notEmpty(),
      body('description').optional().isString(),
      body('size').isFloat().notEmpty(),
      body('building_area').isFloat().notEmpty(),
      body('electrical_power').optional().isNumeric(),
      body('electrical_unit').optional().isString(),
      body('is_toilet_exist').optional().isBoolean(),
      body('photos').isArray().optional(),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { name, asset_id, size, building_area, electrical_power, electrical_unit, is_toilet_exist, description, photos } = req.body;
      req.log?.info({ name }, 'route_units_create');
      const unit = await UnitUsecase.createUnit({
        name,
        asset_id,
        description,
        electrical_power,
        electrical_unit,
        is_toilet_exist,
        size,
        building_area,
        photos,
        createdBy: req.auth.userId
      }, { requestId: req.requestId, log: req.log, roleName: req.auth.roleName, userId: req.auth.userId });
      return res.status(201).json(createResponse(unit, 'Unit created successfully', 201));
    }
  );

  router.get('/', [
    query('status').optional().isIn(['available', 'occupied', 'maintenance', 'reserved', 'inactive', 'out_of_order', '0', '1', '2', '3', '4', '5']).withMessage('status must be one of: available, occupied, maintenance, reserved, inactive, out_of_order, or 0, 1, 2, 3, 4, 5'),
    query('assignable').optional().isIn(['1', 'true', '0', 'false']).withMessage('assignable must be 1, true, 0, or false'),
    query('for_tenant_id').optional().isUUID().withMessage('for_tenant_id must be a valid UUID'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    
    req.log?.info({}, 'route_units_list');
    let { offset, limit } = req.query;
    if (!offset) offset = 0;
    if (!limit) limit = 10;
    try {
      const units = await UnitUsecase.getAllUnits(req.query, { requestId: req.requestId, log: req.log, roleName: req.auth.roleName, userId: req.auth.userId });
      return res.status(200).json(createResponse(units.units, 'Units fetched successfully', 200, true,{ total: units.total, offset: offset, limit: limit }));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, 'route_units_list_error');
      
      return res.status(500).json({ 
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  router.get(
    '/:id',
    [param('id').isString().notEmpty()],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
      req.log?.info({ id: req.params.id }, 'route_units_get');
      try {
        const unit = await UnitUsecase.getUnitById(req.params.id, { requestId: req.requestId, log: req.log, roleName: req.auth.roleName });
        if (!unit) return res.status(404).json(createResponse(null, 'not found', 404 ));
        return res.status(200).json(createResponse(unit, 'Unit fetched successfully', 200));
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_units_get_error');
        return res.status(500).json(createResponse(null, 'Internal Server Error', 500));
      }
    }
  );

  router.put(
    '/:id',
    [
      param('id').isString().notEmpty(),
      body('asset_id').optional({ values: 'falsy' }).isUUID().withMessage('asset_id must be a valid UUID'),
      body('name').optional().isString().notEmpty(),
      body('size').optional().isFloat({ min: 0.01 }).withMessage('size must be a positive number'),
      body('building_area').optional().isFloat({ min: 0.01 }).withMessage('building_area must be a positive number'),
      body('electrical_power').optional().isNumeric(),
      body('electrical_unit').optional().isString(),
      body('is_toilet_exist').optional().isBoolean(),
      body('description').optional().isString(),
      body('status')
        .optional({ values: 'falsy' })
        .custom((value) => normalizeUnitStatusInput(value) !== undefined)
        .withMessage('status must be one of: available, occupied, maintenance, reserved, inactive, out_of_order (or 0-5)'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
      const {
        name,
        asset_id,
        size,
        building_area,
        electrical_power,
        electrical_unit,
        is_toilet_exist,
        description,
        status,
      } = req.body;
      const normalizedStatus = normalizeUnitStatusInput(status);
      req.log?.info({ id: req.params.id }, 'route_units_update');
      try {
        const unit = await UnitUsecase.updateUnit(req.params.id, {
          name,
          asset_id,
          size,
          building_area,
          electrical_power,
          electrical_unit,
          is_toilet_exist,
          description,
          ...(normalizedStatus !== undefined ? { status: normalizedStatus } : {}),
          updatedBy: req.auth.userId
        }, { requestId: req.requestId, log: req.log, roleName: req.auth.roleName, userId: req.auth.userId });
        if (!unit) return res.status(404).json(createResponse(null, 'not found', 404 ));
        return res.status(202).json(createResponse(unit, "success", 202));
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_units_update_error');
        return res.status(500).json(createResponse(null, 'Internal Server Error', 500));
      }
    }
  );

  router.delete(
    '/:id',
    [param('id').isString().notEmpty()],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
      req.log?.info({ id: req.params.id }, 'route_units_delete');
      try {
        const unit = await UnitUsecase.deleteUnit(req.params.id, { requestId: req.requestId, log: req.log, roleName: req.auth.roleName, userId: req.auth.userId });
        if (!unit) return res.status(404).json(createResponse(null, 'Unit not found', 404));
        return res.status(200).json(createResponse(unit, 'Unit deleted successfully', 200));
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_units_delete_error');
        const status = error.statusCode === 400 ? 400 : 500;
        const message = error.message || (status === 400 ? 'failed' : 'Internal Server Error');
        return res.status(status).json(createResponse(null, message, status, false, {}, error));
      }
    }
  );

  router.get("/:id/logs", async (req, res) => {
    try {
      req.log?.info({ id: req.params.id }, 'UnitRouter.getLogs 1 ');
      const unitLogs = await UnitUsecase.getUnitLogs(req.params.id, { 
        requestId: req.requestId, 
        log: req.log, 
        roleName: req.auth.roleName,
        userId: req.auth.userId
      });

      req.log?.info({ id: req.params.id, logsCount: unitLogs.length }, 'UnitRouter.getLogs_success');

      return res.status(200).json(createResponse(unitLogs, "success", 200, true, {
        total: unitLogs.length,
        limit: unitLogs.length,
        offset: 0
      }));
    } catch (error) {
      req.log?.error({ id: req.params.id, error: error.message }, 'UnitRouter.getLogs_error');
      return res.status(500).json(createResponse(null, "Internal server error", 500, false, {
        error: error.message
      }));
    }
  })

  return router;
}

module.exports = {InitUnitRouter};