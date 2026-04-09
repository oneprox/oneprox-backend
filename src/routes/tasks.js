const { Router } = require("express");
const { body, validationResult, param, query } = require("express-validator");
const { authMiddleware, ensureRole } = require("../middleware/auth");
const { createResponse } = require("../services/response");

function InitTaskRouter(taskUsecase) {
  const router = Router();

  async function createTask(req, res) {
    try {
      req.log?.info({}, "TaskRouter.createTask");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      const task = await taskUsecase.createTask(req.body, {
        userId: req.auth?.userId,
        log: req.log,
      });
      return res.status(201).json(createResponse(task, "success", 201));
    } catch (error) {
      req.log?.error(error, "TaskRouter.createTask");
      return res
        .status(500)
        .json(createResponse(null, "internal server error", 500));
    }
  }

  async function getTasks(req, res) {
    try {
      req.log?.info({ query: req.query }, "TaskRouter.getTasks");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      // Disable caching to prevent 304 responses
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      // Build filters from query parameters
      const filters = {};
      if (req.query.task_group_id) {
        filters.task_group_id = parseInt(req.query.task_group_id);
      }
      if (req.query.is_main_task !== undefined) {
        filters.is_main_task = req.query.is_main_task === 'true';
      }
      if (req.query.is_routine !== undefined) {
        filters.is_routine = req.query.is_routine === 'true';
      }
      if (req.query.role_id) {
        filters.role_id = parseInt(req.query.role_id);
      }
      if (req.query.asset_id) {
        filters.asset_id = req.query.asset_id;
      }
      if (req.query.name) {
        filters.name = req.query.name;
      }
      if (req.query.parent_task_id) {
        filters.parent_task_id = parseInt(req.query.parent_task_id);
      }
      if (req.query.child_task_id) {
        filters.child_task_id = parseInt(req.query.child_task_id);
      }
      if (req.query.non_routine_group_id) {
        filters.non_routine_group_id = req.query.non_routine_group_id;
      }
      if (req.query.order) {
        filters.order = req.query.order;
      }
      if (req.query.limit) {
        filters.limit = parseInt(req.query.limit);
      }
      if (req.query.offset) {
        filters.offset = parseInt(req.query.offset);
      }
      
      const result = await taskUsecase.getAllTasks(filters, {
        userId: req.auth?.userId,
        log: req.log,
      });
      
      return res.status(200).json(createResponse(result, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, errorStack: error.stack }, "TaskRouter.getTasks");
      return res
        .status(500)
        .json(createResponse(null, "internal server error", 500));
    }
  }

  async function getTaskById(req, res) {
    try {
      req.log?.info({ id: req.params.id }, "TaskRouter.getTaskById");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      // Disable caching to prevent 304 responses
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      const task = await taskUsecase.getTaskById(req.params.id, {
        userId: req.auth?.userId,
        log: req.log,
      });
      
      if (!task) {
        return res
          .status(404)
          .json(createResponse(null, "task not found", 404));
      }
      
      return res.status(200).json(createResponse(task, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, errorStack: error.stack, id: req.params.id }, "TaskRouter.getTaskById");
      return res
        .status(500)
        .json(createResponse(null, "internal server error", 500));
    }
  }

  async function updateTask(req, res) {
    try {
      req.log?.info({ id: req.params.id }, "TaskRouter.updateTask");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      const task = await taskUsecase.updateTask(req.params.id, req.body, {
        userId: req.auth?.userId,
        log: req.log,
      });
      if (!task) {
        return res
          .status(404)
          .json(createResponse(null, "task not found", 404));
      }
      return res.status(200).json(createResponse(task, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, errorStack: error.stack, id: req.params.id, body: req.body }, "TaskRouter.updateTask");
      return res
        .status(500)
        .json(createResponse(null, "internal server error", 500));
    }
  }

  async function deleteTask(req, res) {
    try {
      req.log?.info({ id: req.params.id }, "TaskRouter.deleteTask");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      const deleted = await taskUsecase.deleteTask(req.params.id, {
        userId: req.auth?.userId,
        log: req.log,
      });
      
      if (!deleted) {
        return res
          .status(404)
          .json(createResponse(null, "task not found", 404));
      }
      
      return res.status(200).json(createResponse({ deleted: true }, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, errorStack: error.stack, id: req.params.id }, "TaskRouter.deleteTask");
      return res
        .status(500)
        .json(createResponse(null, "internal server error", 500));
    }
  }

  async function getTaskLogs(req, res) {
    try {
      req.log?.info({ id: req.params.id }, "TaskRouter.getTaskLogs");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      // Disable caching to prevent 304 responses
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      const logs = await taskUsecase.getTaskLogs(req.params.id, {
        userId: req.auth?.userId,
        log: req.log,
      });
      return res.status(200).json(createResponse(logs, "success", 200));
    } catch (error) {
      req.log?.error(error, "TaskRouter.getTaskLogs");
      return res
        .status(500)
        .json(createResponse(null, "internal server error", 500));
    }
  }

  const createTaskParam = [
    body("name").isString().notEmpty().trim(),
    body("is_routine").optional().isBoolean(),
    body("is_main_task").isBoolean().optional(),
    body("is_need_validation").isBoolean().optional(),
    body("is_scan").isBoolean().optional(),
    body("scan_code").isString().optional(),
    body("duration").isInt().notEmpty(),
    body("asset_id").isUUID().notEmpty(),
    body("role_id").isInt().notEmpty(),
    body("is_all_times").isBoolean().optional(),
    body("parent_task_ids").isArray().optional(),
    body("parent_task_ids.*").isInt().optional(),
    body("task_group_id").isInt().optional(),
    body("days").isArray().optional(),
    body("times").isArray().optional(),
    body("monthly_frequency").optional().isInt({ min: 1, max: 5 }),
    body("due_date").optional().isInt({ min: 1, max: 28 }),
    body("area").optional().isString(),
    body("assigned_user_id").optional().isUUID(),
    body("non_routine_items").optional().isArray(),
    body("non_routine_items.*.due_date").optional().isInt({ min: 1, max: 28 }),
    body("non_routine_items.*.area").optional().isString(),
    body("non_routine_items.*.assigned_user_id").optional().isUUID(),
    body("non_routine_group_id").optional().isUUID(),
  ];

  const updateTaskParam = [
    param("id").isInt().notEmpty(),
    body("name").isString().optional().trim(),
    body("is_routine").optional().isBoolean(),
    body("is_main_task").isBoolean().optional(),
    body("is_need_validation").isBoolean().optional(),
    body("is_scan").isBoolean().optional(),
    body("scan_code").isString().optional(),
    body("duration").isInt().optional(),
    body("asset_id").isUUID().optional(),
    body("role_id").isInt().optional(),
    body("is_all_times").isBoolean().optional(),
    body("parent_task_ids").isArray().optional(), // Array of parent task IDs
    body("parent_task_ids.*").isInt().optional(), // Validate each element in array
    body("task_group_id").isInt().optional(),
    body("days").isArray().optional(),
    body("times").isArray().optional(),
    body("monthly_frequency").optional().isInt({ min: 1, max: 5 }),
    body("due_date").optional().isInt({ min: 1, max: 28 }),
    body("area").optional().isString(),
    body("assigned_user_id").optional().isUUID(),
    body("non_routine_items").optional().isArray(),
    body("non_routine_items.*.due_date").optional().isInt({ min: 1, max: 28 }),
    body("non_routine_items.*.area").optional().isString(),
    body("non_routine_items.*.assigned_user_id").optional().isUUID(),
    body("non_routine_group_id").optional().isUUID(),
  ];

  const getTaskLogsParam = [
    param("id").isInt().notEmpty(),
  ];

  const getTaskByIdParam = [
    param("id").isInt().notEmpty().withMessage("id must be an integer"),
  ];

  const deleteTaskParam = [
    param("id").isInt().notEmpty().withMessage("id must be an integer"),
  ];

  const getTasksParam = [
    query("task_group_id").optional().isInt().withMessage("task_group_id must be an integer"),
    query("is_main_task").optional().isBoolean().withMessage("is_main_task must be a boolean"),
    query("is_routine").optional().isBoolean().withMessage("is_routine must be a boolean"),
    query("role_id").optional().isInt().withMessage("role_id must be an integer"),
    query("asset_id").optional().isUUID().withMessage("asset_id must be a valid UUID"),
    query("name").optional().isString().trim(),
    query("parent_task_id").optional().isInt().withMessage("parent_task_id must be an integer"),
    query("child_task_id").optional().isInt().withMessage("child_task_id must be an integer"),
    query("order").optional().isIn(['newest', 'oldest', 'a-z', 'z-a']).withMessage("order must be one of: newest, oldest, a-z, z-a"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100"),
    query("offset").optional().isInt({ min: 0 }).withMessage("offset must be a non-negative integer"),
    query("non_routine_group_id").optional().isUUID().withMessage("non_routine_group_id must be a valid UUID"),
  ];

  router.use(authMiddleware, ensureRole);

  router.post("/", createTaskParam, createTask);
  router.get("/", getTasksParam, getTasks);
  router.get("/:id/logs", getTaskLogsParam, getTaskLogs); // More specific route first
  router.get("/:id", getTaskByIdParam, getTaskById);
  router.put("/:id", updateTaskParam, updateTask);
  router.delete("/:id", deleteTaskParam, deleteTask);

  return router;
}

module.exports = { InitTaskRouter };
