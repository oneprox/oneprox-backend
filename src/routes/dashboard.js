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

  router.get('/asset-overview', async (req, res) => {
    try {
      req.log?.info({ query: req.query }, 'DashboardRouter.getAssetOverview');
      const assetOverview = await dashboardUsecase.getAssetOverview(req.query, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(
        createResponse(assetOverview, 'Asset overview retrieved successfully', 200)
      );
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getAssetOverview_error'
      );
      return res.status(500).json(
        createResponse(null, 'Internal server error', 500)
      );
    }
  });

  router.get('/financial-table', async (req, res) => {
    try {
      req.log?.info({ query: req.query }, 'DashboardRouter.getFinancialTable');
      const financialTable = await dashboardUsecase.getFinancialTable(req.query, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(
        createResponse(financialTable, 'Financial table retrieved successfully', 200)
      );
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getFinancialTable_error'
      );
      return res.status(500).json(
        createResponse(null, 'Internal server error', 500)
      );
    }
  });

  router.get('/worker-user-tasks', async (req, res) => {
    try {
      req.log?.info({ query: req.query }, 'DashboardRouter.getWorkerUserTasks');
      const payload = await dashboardUsecase.getWorkerUserTasks(req.query, {
        userId: req.auth?.userId,
        log: req.log,
      });
      return res
        .status(200)
        .json(createResponse(payload, 'Worker user tasks retrieved successfully', 200));
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardRouter.getWorkerUserTasks_error'
      );
      return res.status(500).json(createResponse(null, 'Internal server error', 500));
    }
  });

  router.get(
    '/non-routine-work',
    [
      query('asset_id').optional().isUUID().withMessage('asset_id must be a valid UUID'),
      query('date_from')
        .optional()
        .isISO8601({ strict: false })
        .withMessage('date_from must be a valid ISO 8601 date'),
      query('date_to')
        .optional()
        .isISO8601({ strict: false })
        .withMessage('date_to must be a valid ISO 8601 date'),
      query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be between 1 and 500'),
      query('offset').optional().isInt({ min: 0 }).withMessage('offset must be a non-negative integer'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          createResponse(null, errors.array()[0]?.msg || 'Validation failed', 400)
        );
      }
      try {
        req.log?.info({ query: req.query }, 'DashboardRouter.getNonRoutineWork');
        const payload = await dashboardUsecase.getNonRoutineWork(req.query, {
          userId: req.auth?.userId,
          log: req.log,
        });
        return res.status(200).json(
          createResponse(payload, 'Non-routine work retrieved successfully', 200)
        );
      } catch (error) {
        req.log?.error(
          { error: error.message, stack: error.stack },
          'DashboardRouter.getNonRoutineWork_error'
        );
        return res.status(500).json(createResponse(null, 'Internal server error', 500));
      }
    }
  );

  return router;
}

module.exports = { InitDashboardRouter };

