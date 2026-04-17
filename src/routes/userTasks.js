const { Router } = require("express");
const { body, validationResult, param, query } = require("express-validator");
const { authMiddleware, ensureRole } = require("../middleware/auth");
const { createResponse } = require("../services/response");
const uploadUserTaskEvidenceMiddleware = require("../middleware/uploadUserTaskEvidence");
const { compressUploadedImages } = require("../middleware/imageCompressor");

function InitUserTaskRouter(userTaskUsecase) {
  const router = Router();

  async function generateUpcomingUserTasks(req, res) {
    try {
      req.log?.info({}, "UserTaskRouter.generateUpcomingUserTasks");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      const result = await userTaskUsecase.generateUpcomingUserTasks({
        userId: req.auth?.userId,
        log: req.log,
      });
      
      return res.status(201).json(createResponse(result, "User tasks generated successfully", 201));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.generateUpcomingUserTasks");
      
      // Handle conflict error (already generated)
      if (error.statusCode === 409 || error.message.includes('already been generated')) {
        return res
          .status(409)
          .json(createResponse(null, error.message || "User tasks have already been generated for this task group time range", 409));
      }
      
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  async function getUserTasks(req, res) {
    try {
      req.log?.info({}, "UserTaskRouter.getUserTasks");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      // Use user_id from query parameter if provided (for admin viewing other users)
      // Otherwise use authenticated user's ID
      const userId = req.query.user_id || req.auth?.userId;
      
      if (!userId) {
        return res.status(401).json(
          createResponse(null, "Unauthorized: User ID not found", 401)
        );
      }
      
      req.log?.info({ userId, query_user_id: req.query.user_id }, "UserTaskRouter.getUserTasks");
      
      const result = await userTaskUsecase.getUserTasks(userId, req.query, {
        userId: req.auth?.userId, // Keep original authenticated user for context
        log: req.log,
      });
      
      return res.status(200).json(createResponse(result, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.getUserTasks");
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  async function getUpcomingUserTasks(req, res) {
    try {
      req.log?.info({}, "UserTaskRouter.getUpcomingUserTasks");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      const result = await userTaskUsecase.getUpcomingUserTasks(req.auth?.userId, {
        userId: req.auth?.userId,
        log: req.log,
      });
      
      return res.status(200).json(createResponse(result, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.getUpcomingUserTasks");
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  async function startUserTask(req, res) {
    try {
      req.log?.info({ id: req.params.id }, "UserTaskRouter.startUserTask");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      const result = await userTaskUsecase.startUserTask(req.params.id, {
        userId: req.auth?.userId,
        log: req.log,
      });
      
      if (!result) {
        return res
          .status(404)
          .json(createResponse(null, "user task not found", 404));
      }
      
      return res.status(200).json(createResponse(result, "Task started successfully", 200));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.startUserTask");
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  async function completeUserTask(req, res) {
    try {
      req.log?.info({ id: req.params.id, files: req.files }, "UserTaskRouter.completeUserTask");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      // Process files and create evidence data
      const evidences = [];
      const host = req.protocol + '://' + req.get('host');
      
      if (req.files) {
        // Handle file_before (for validation)
        if (req.files.file_before && req.files.file_before[0]) {
          const file = req.files.file_before[0];
          evidences.push({
            url: `${host}/uploads/user-task-evidence/${file.filename}`,
          });
        }
        
        // Handle file_after (for validation)
        if (req.files.file_after && req.files.file_after[0]) {
          const file = req.files.file_after[0];
          evidences.push({
            url: `${host}/uploads/user-task-evidence/${file.filename}`,
          });
        }
        
        // Handle file_scan (for scan barcode)
        if (req.files.file_scan && req.files.file_scan[0]) {
          const file = req.files.file_scan[0];
          evidences.push({
            url: `${host}/uploads/user-task-evidence/${file.filename}`,
          });
        }
      }
      
      // Always add remark as text evidence if provided, even if there are files
      if (req.body.remark && req.body.remark.trim()) {
        evidences.push({
          url: `text:${req.body.remark}`,
        });
      }
      
      // Prepare complete data object
      const completeData = {
        notes: req.body.notes || req.body.remark || null,
        evidences: evidences
      };
      
      const result = await userTaskUsecase.completeUserTask(req.params.id, completeData, {
        userId: req.auth?.userId,
        log: req.log,
      });
      
      if (!result) {
        return res
          .status(404)
          .json(createResponse(null, "user task not found", 404));
      }
      
      return res.status(200).json(createResponse(result, "Task completed successfully", 200));
    } catch (error) {
      console.log(error);
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.completeUserTask");
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  const getUserTasksParam = [
    query("limit").isInt().optional(),
    query("offset").isInt().optional(),
    query("user_id").optional().isUUID().withMessage("user_id must be a valid UUID"),
    query("date_from").optional().isISO8601().withMessage("date_from must be a valid ISO 8601 date"),
    query("date_to").optional().isISO8601().withMessage("date_to must be a valid ISO 8601 date"),
    query("routine_latest_batch_only")
      .optional()
      .isIn(["0", "1"])
      .withMessage("routine_latest_batch_only must be 0 or 1"),
  ];

  const getNonRoutineUserTasksParam = [
    query("limit").optional().isInt({ min: 1, max: 500 }).withMessage("limit must be between 1 and 500"),
    query("offset").optional().isInt({ min: 0 }).withMessage("offset must be non-negative"),
    query("user_id").optional().isUUID().withMessage("user_id must be a valid UUID"),
    query("date_from").optional().isISO8601({ strict: false }).withMessage("date_from must be a valid ISO 8601 date"),
    query("date_to").optional().isISO8601({ strict: false }).withMessage("date_to must be a valid ISO 8601 date"),
    query("period").optional().matches(/^\d{4}-\d{2}$/).withMessage("period must be YYYY-MM"),
  ];

  async function getNonRoutineUserTasks(req, res) {
    try {
      req.log?.info({ query: req.query }, "UserTaskRouter.getNonRoutineUserTasks");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }

      const userId = req.query.user_id || req.auth?.userId;
      if (!userId) {
        return res.status(401).json(createResponse(null, "Unauthorized: User ID not found", 401));
      }

      const result = await userTaskUsecase.getNonRoutineUserTasks(userId, req.query, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(
        createResponse(
          {
            user_tasks: result.rows,
            total: result.total,
            limit: Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50)),
            offset: Math.max(0, parseInt(req.query.offset, 10) || 0),
          },
          "success",
          200
        )
      );
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.getNonRoutineUserTasks");
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  const startUserTaskParam = [
    param("id").isInt().notEmpty(),
  ];

  const completeUserTaskParam = [
    param("id").isInt().notEmpty(),
    body("notes").isString().optional(),
    body("evidence").optional().custom((value) => {
      // Allow single URL string or array of URL strings
      if (Array.isArray(value)) {
        // Validate each item in array is a string (URL)
        for (const url of value) {
          if (typeof url !== 'string' || !url.trim()) {
            throw new Error('Each evidence must be a non-empty URL string');
          }
        }
      } else if (typeof value === 'string') {
        // Single URL string is valid
        if (!value.trim()) {
          throw new Error('Evidence URL must be a non-empty string');
        }
      } else if (value !== undefined && value !== null) {
        throw new Error('Evidence must be a URL string or array of URL strings');
      }
      return true;
    }),
  ];

  async function getUserTaskByCode(req, res) {
    try {
      req.log?.info({ code: req.params.code }, "UserTaskRouter.getUserTaskByCode");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }
      
      const result = await userTaskUsecase.getUserTaskByCode(req.params.code, {
        userId: req.auth?.userId,
        log: req.log,
      });
      
      if (!result) {
        return res
          .status(404)
          .json(createResponse(null, "user task not found", 404));
      }
      
      return res.status(200).json(createResponse(result, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.getUserTaskByCode");
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  async function getUserTaskById(req, res) {
    try {
      req.log?.info({ id: req.params.id }, "UserTaskRouter.getUserTaskById");
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json(createResponse(null, "validation error", 400, errors.array()));
      }

      const result = await userTaskUsecase.getUserTaskById(req.params.id, {
        userId: req.auth?.userId,
        roleName: req.auth?.roleName,
        log: req.log,
      });

      if (!result) {
        return res
          .status(404)
          .json(createResponse(null, "user task not found", 404));
      }

      return res.status(200).json(createResponse(result, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserTaskRouter.getUserTaskById");
      return res
        .status(500)
        .json(createResponse(null, error.message || "internal server error", 500));
    }
  }

  const getCompletedTasksParam = [
    query("start_date").optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("start_date must be in YYYY-MM-DD format"),
    query("end_date").optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("end_date must be in YYYY-MM-DD format"),
    query("user_id").optional().isUUID().withMessage("user_id must be a valid UUID"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100"),
    query("offset").optional().isInt({ min: 0 }).withMessage("offset must be a non-negative integer"),
  ];

  const getUserTaskByCodeParam = [
    param("code").isString().notEmpty().withMessage("code is required"),
  ];
  const getUserTaskByIdParam = [
    param("id").isInt().notEmpty().withMessage("id must be an integer"),
  ];

  router.use(authMiddleware, ensureRole);

  router.post("/generate-upcoming", generateUpcomingUserTasks);
  router.get("/code/:code", getUserTaskByCodeParam, getUserTaskByCode);
  router.get("/non-routine", getNonRoutineUserTasksParam, getNonRoutineUserTasks);
  router.get("/upcoming", getUpcomingUserTasks);
  router.get("/:id", getUserTaskByIdParam, getUserTaskById);
  router.get("/", getUserTasksParam, getUserTasks);
  router.put("/:id/start", startUserTaskParam, startUserTask);
  router.put("/:id/complete", uploadUserTaskEvidenceMiddleware(), compressUploadedImages, completeUserTaskParam, completeUserTask);

  return router;
}

module.exports = { InitUserTaskRouter };
