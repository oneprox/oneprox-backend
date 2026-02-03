const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');
const { createResponse } = require('../services/response');

function InitDashboardRouter(dashboardUsecase) {
  const router = Router();

  router.use(authMiddleware, ensureRole);

  router.get('/', async (req, res) => {
    try {
      req.log?.info({}, 'DashboardRouter.getDashboardData');
      const dashboardData = await dashboardUsecase.getDashboardData({
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(
        createResponse(dashboardData, 'Dashboard data retrieved successfully', 200)
      );
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getDashboardData_error'
      );
      return res.status(500).json(
        createResponse(null, 'Internal server error', 500)
      );
    }
  });

  router.get('/stats', async (req, res) => {
    try {
      req.log?.info({}, 'DashboardRouter.getDashboardStats');
      const stats = await dashboardUsecase.getDashboardStats({
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(
        createResponse(stats, 'Dashboard stats retrieved successfully', 200)
      );
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getDashboardStats_error'
      );
      return res.status(500).json(
        createResponse(null, 'Internal server error', 500)
      );
    }
  });

  router.get('/top-asset-revenue', async (req, res) => {
    try {
      req.log?.info({}, 'DashboardRouter.getTopAssetRevenue');
      const topAssets = await dashboardUsecase.getTopAssetRevenue({
        userId: req.auth?.userId,
        log: req.log,
      });
      console.log('Top Assets:', topAssets);
      return res.status(200).json(
        createResponse(topAssets, 'Top asset revenue retrieved successfully', 200)
      );
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getTopAssetRevenue_error'
      );
      return res.status(500).json(
        createResponse(null, 'Internal server error', 500)
      );
    }
  });

  router.get('/revenue-growth', async (req, res) => {
    try {
      req.log?.info({}, 'DashboardRouter.getRevenueGrowth');
      const revenueGrowth = await dashboardUsecase.getRevenueGrowth({
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(
        createResponse(revenueGrowth, 'Revenue growth retrieved successfully', 200)
      );
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getRevenueGrowth_error'
      );
      return res.status(500).json(
        createResponse(null, 'Internal server error', 500)
      );
    }
  });

  const getNonRepeatUserTasksQuery = [
    query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be 1-500'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be non-negative'),
  ];
  router.get('/non-repeat-user-tasks', getNonRepeatUserTasksQuery, async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'Validation error', 400, false, {}, errors.array()));
      }
      req.log?.info({ query: req.query }, 'DashboardRouter.getNonRepeatUserTasks');
      const filters = {};
      if (req.query.limit) filters.limit = parseInt(req.query.limit, 10);
      if (req.query.offset) filters.offset = parseInt(req.query.offset, 10);
      const result = await dashboardUsecase.getNonRepeatUserTasks(filters, {
        userId: req.auth?.userId,
        log: req.log,
      });
      return res.status(200).json(
        createResponse(result.items, 'Non-repeat user tasks retrieved successfully', 200, true, {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        })
      );
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getNonRepeatUserTasks_error'
      );
      return res.status(500).json(
        createResponse(null, 'Internal server error', 500)
      );
    }
  });

  return router;
}

module.exports = { InitDashboardRouter };

