const { Router } = require('express');
const { body, validationResult, query } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');

function InitAttendanceRouter(attendanceUsecase) {
  const router = Router();
  router.use(authMiddleware, ensureRole);

  // Check-in endpoint
  router.post('/check-in', [
    body('asset_id').notEmpty().withMessage('Asset ID is required'),
    body('latitude').isFloat().withMessage('Latitude must be a valid number'),
    body('longitude').isFloat().withMessage('Longitude must be a valid number'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { asset_id, latitude, longitude, notes } = req.body;
      const user_id = req.auth?.userId;

      if (!user_id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID not found'
        });
      }

      req.log?.info({ user_id, asset_id, latitude, longitude, notes }, 'route_check_in');
      const result = await attendanceUsecase.checkIn(user_id, asset_id, latitude, longitude, notes);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, 'route_check_in_error');
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  });

  // Check-out endpoint
  router.post('/check-out', [
    body('asset_id').notEmpty().withMessage('Asset ID is required'),
    body('latitude').isFloat().withMessage('Latitude must be a valid number'),
    body('longitude').isFloat().withMessage('Longitude must be a valid number'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { asset_id, latitude, longitude, notes } = req.body;
      const user_id = req.auth?.userId;

      if (!user_id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID not found'
        });
      }

      req.log?.info({ user_id, asset_id, latitude, longitude, notes }, 'route_check_out');
      const result = await attendanceUsecase.checkOut(user_id, asset_id, latitude, longitude, notes);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, 'route_check_out_error');
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  });

  // Get today's attendance status
  router.get('/today-status/:assetId', async (req, res) => {
    try {
      const { assetId } = req.params;
      const user_id = req.auth?.userId;

      if (!user_id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID not found'
        });
      }

      req.log?.info({ user_id, assetId }, 'route_get_today_status');
      const result = await attendanceUsecase.getTodayStatus(user_id, assetId);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, 'route_get_today_status_error');
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  });

  // Get user attendance history
  router.get('/history', [
    query('date_from').optional().isISO8601().withMessage('date_from must be a valid ISO 8601 date'),
    query('date_to').optional().isISO8601().withMessage('date_to must be a valid ISO 8601 date'),
    query('user_id').optional().isUUID().withMessage('user_id must be a valid UUID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be 0 or greater'),
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      // Use user_id from query parameter if provided (for admin viewing other users)
      // Otherwise use authenticated user's ID
      let user_id = req.query.user_id || req.auth?.userId;

      if (!user_id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID not found'
        });
      }

      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      const date_from = req.query.date_from || null;
      const date_to = req.query.date_to || null;

      req.log?.info({ user_id, limit, offset, date_from, date_to, query_user_id: req.query.user_id }, 'route_get_user_history');
      const result = await attendanceUsecase.getUserAttendanceHistory(user_id, limit, offset, date_from, date_to);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, 'route_get_user_history_error');
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  });

  // Get asset attendance history (admin only)
  router.get('/asset-history/:assetId', [
    query('date_from').optional().isISO8601().withMessage('date_from must be a valid ISO 8601 date'),
    query('date_to').optional().isISO8601().withMessage('date_to must be a valid ISO 8601 date'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { assetId } = req.params;
      const limit = parseInt(req.query.limit) || 10;
      const date_from = req.query.date_from || null;
      const date_to = req.query.date_to || null;

      req.log?.info({ assetId, limit, date_from, date_to }, 'route_get_asset_history');
      const result = await attendanceUsecase.getAssetAttendanceHistory(assetId, limit, date_from, date_to);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, 'route_get_asset_history_error');
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  });

  return router;
}

module.exports = { InitAttendanceRouter };
