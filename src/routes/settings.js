const { Router } = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');
const { createResponse } = require('../services/response');

function InitSettingsRouter(settingsUsecase) {
  const router = Router();
  router.use(authMiddleware, ensureRole);

  // GET /api/settings - List all settings or get by key (query parameter)
  router.get(
    '/',
    [query('key').optional().isString().withMessage('Key must be a string')],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, false, {}, errors));
      }
      
      // If key parameter is provided, get setting by key
      if (req.query.key) {
        req.log?.info({ key: req.query.key }, 'route_settings_get_by_key');
        try {
          const setting = await settingsUsecase.getSettingByKey(req.query.key, { 
            requestId: req.requestId, 
            log: req.log,
            userId: req.auth?.userId,
          roleName: req.auth?.roleName,
          });
          if (!setting) {
            return res.status(404).json(createResponse(null, 'Setting not found', 404));
          }
          return res.json(createResponse(setting, 'success', 200));
        } catch (error) {
          req.log?.error({ error: error.message }, 'route_settings_get_by_key_error');
          return res.status(500).json(createResponse(null, error.message || 'Internal Server Error', 500));
        }
      }
      
      // Otherwise, list all settings
      req.log?.info({}, 'route_settings_list');
      try {
        const settings = await settingsUsecase.listAllSettings({ 
          requestId: req.requestId, 
          log: req.log,
          userId: req.auth?.userId,
          roleName: req.auth?.roleName,
        });
        return res.json(createResponse(settings, 'success', 200));
      } catch (error) {
        req.log?.error({ error: error.message, stack: error.stack }, 'route_settings_list_error');
        return res.status(500).json(createResponse(null, error.message || 'Internal Server Error', 500));
      }
    }
  );

  // GET /api/settings/:id - Get setting by ID
  router.get(
    '/:id',
    [param('id').isInt({ min: 1 }).withMessage('Invalid setting ID')],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, false, {}, errors));
      }
      req.log?.info({ id: req.params.id }, 'route_settings_get');
      try {
        const setting = await settingsUsecase.getSettingById(req.params.id, { 
          requestId: req.requestId, 
          log: req.log,
          userId: req.auth?.userId,
          roleName: req.auth?.roleName,
        });
        if (!setting) {
          return res.status(404).json(createResponse(null, 'Setting not found', 404));
        }
        return res.json(createResponse(setting, 'success', 200));
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_settings_get_error');
        return res.status(500).json(createResponse(null, error.message || 'Internal Server Error', 500));
      }
    }
  );


  // POST /api/settings - Create new setting
  router.post(
    '/',
    [
      body('key').isString().notEmpty().withMessage('Key is required'),
      body('value').notEmpty().withMessage('Value is required'),
      body('description').optional().isString(),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, false, {}, errors));
      }
      req.log?.info({ key: req.body.key }, 'route_settings_create');
      try {
        const setting = await settingsUsecase.createSetting(req.body, { 
          requestId: req.requestId, 
          log: req.log,
          userId: req.auth?.userId,
          roleName: req.auth?.roleName,
        });
        return res.status(201).json(createResponse(setting, 'Setting created successfully', 201));
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_settings_create_error');
        return res.status(error.status || 400).json(createResponse(null, error.message || 'Failed to create setting', 400));
      }
    }
  );


  // PUT /api/settings/:key - Update setting by key or ID (using key as path parameter)
  router.put(
    '/:key',
    [
      param('key').notEmpty().withMessage('Key or ID is required'),
      body('value').notEmpty().withMessage('Value is required'),
      body('description').optional().isString(),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, false, {}, errors));
      }
      
      // Check if key is a number (ID) or string (key)
      const keyParam = req.params.key;
      const isNumeric = /^\d+$/.test(keyParam);
      
      if (isNumeric) {
        // Update by ID
        req.log?.info({ id: keyParam }, 'route_settings_update_by_id');
        try {
          const setting = await settingsUsecase.updateSetting(parseInt(keyParam), req.body, { 
            requestId: req.requestId, 
            log: req.log,
            userId: req.auth?.userId,
          roleName: req.auth?.roleName,
          });
          if (!setting) {
            return res.status(404).json(createResponse(null, 'Setting not found', 404));
          }
          return res.json(createResponse(setting, 'Setting updated successfully', 200));
        } catch (error) {
          req.log?.error({ error: error.message }, 'route_settings_update_by_id_error');
          return res.status(error.status || 400).json(createResponse(null, error.message || 'Failed to update setting', 400));
        }
      } else {
        // Update by key
        req.log?.info({ key: keyParam }, 'route_settings_update_by_key');
        try {
          const setting = await settingsUsecase.updateSettingByKey(keyParam, req.body, { 
            requestId: req.requestId, 
            log: req.log,
            userId: req.auth?.userId,
          roleName: req.auth?.roleName,
          });
          if (!setting) {
            return res.status(404).json(createResponse(null, 'Setting not found', 404));
          }
          return res.json(createResponse(setting, 'Setting updated successfully', 200));
        } catch (error) {
          req.log?.error({ error: error.message }, 'route_settings_update_by_key_error');
          return res.status(error.status || 400).json(createResponse(null, error.message || 'Failed to update setting', 400));
        }
      }
    }
  );

  // DELETE /api/settings/:id - Delete setting
  router.delete(
    '/:id',
    [param('id').isInt({ min: 1 }).withMessage('Invalid setting ID')],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, false, {}, errors));
      }
      req.log?.info({ id: req.params.id }, 'route_settings_delete');
      try {
        await settingsUsecase.deleteSetting(req.params.id, { 
          requestId: req.requestId, 
          log: req.log,
          userId: req.auth?.userId,
          roleName: req.auth?.roleName,
        });
        return res.json(createResponse(null, 'Setting deleted successfully', 200));
      } catch (error) {
        req.log?.error({ error: error.message }, 'route_settings_delete_error');
        return res.status(error.status || 400).json(createResponse(null, error.message || 'Failed to delete setting', 400));
      }
    }
  );


  return router;
}

module.exports = { InitSettingsRouter };

