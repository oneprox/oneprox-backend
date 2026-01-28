const { Router } = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');
const { createResponse } = require('../services/response');

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
      body('electrical_power').notEmpty().isNumeric(),
      body('electrical_unit').optional().isString(),
      body('is_toilet_exist').notEmpty().isBoolean(),
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
    query('status').optional().isIn(['available', 'occupied', 'maintenance', 'reserved', 'inactive', 'out_of_order', '0', '1', '2', '3', '4', '5']).withMessage('status must be one of: available, occupied, maintenance, reserved, inactive, out_of_order, or 0, 1, 2, 3, 4, 5')
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
      body('name').optional().isString().notEmpty(),
      body('size').optional().isFloat().notEmpty(),
      body('building_area').optional().isFloat().notEmpty(),
      body('electrical_power').optional().isNumeric(),
      body('electrical_unit').optional().isString(),
      body('is_toilet_exist').optional().isBoolean(),
      body('description').optional().isString(),
      body('status').optional().isIn(['available', 'occupied', 'maintenance', 'reserved', 'inactive', 'out_of_order']).withMessage('status must be one of: available, occupied, maintenance, reserved, inactive, out_of_order')
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
      const { name, size, building_area, electrical_power, electrical_unit, is_toilet_exist, description, status } = req.body;
      req.log?.info({ id: req.params.id }, 'route_units_update');
      try {
        const unit = await UnitUsecase.updateUnit(req.params.id, {
          name,
          size,
          building_area,
          electrical_power,
          electrical_unit,
          is_toilet_exist,
          description,
          status,
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
        return res.status(500).json(createResponse(null, 'Internal Server Error', 500));
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