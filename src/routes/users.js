const { Router } = require("express");
const { body, validationResult, param, query } = require("express-validator");
const { authMiddleware, ensureRole } = require("../middleware/auth");
const { createResponse } = require('../services/response');
const { UserGenderIntToStr, UserStatusIntToStr } = require("../models/User");

function InitUserRouter(userUsecase, userAccessMenuUsecase) {
  const router = Router();
  const getUsersParam = [
    query("asset_id").optional().isUUID().withMessage("asset_id must be a valid UUID"),
    query("role_id").optional().isInt().withMessage("role_id must be an integer"),
  ];

  const getUsers = async (req, res) => {
    req.log?.info({}, "UserRouter.getUsers");
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    }
    if (!req.query.limit) {
      req.query.limit = "10"
    }
    if (!req.query.offset) {
      req.query.offset = "0"
    }
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;
    if (req.query.role_id !== undefined) {
      req.query.role_id = parseInt(req.query.role_id, 10);
    }
    try {
      const users = await userUsecase.listUsers(req.query, {
        requestId: req.requestId,
        log: req.log,
        roleName: req.auth.roleName,
      });
      if (users === "forbidden")
        return res.status(403).json(createResponse(null, "forbidden", 403));
      return res.status(200).json(createResponse(users.users, "success", 200, true, {
        total: users.total,
        limit: limit,
        offset: offset
      }));
    } catch (error) {
      req.log?.error(
        { error: error.message, stack: error.stack },
        "UserRouter.getUsers_error"
      );

      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  };
  const getUserPermission = async (req, res) => {
    req.log?.info({ userId: req.auth.userId }, "UserRouter.getUserPermission");
    try {
      const permissions = await userUsecase.getUserPermissions(
        req.auth.userId,
        {
          requestId: req.requestId,
          log: req.log,
        }
      );
      return res.status(200).json(createResponse(permissions, "list permission", 200, true, {total: permissions.length, limit: permissions.length, offset: 0}));
    } catch (error) {
      req.log?.error({ error: error.message }, "UserRouter.getUserPermission_error");
      return res.status(500).json(createResponse(null,"Internal Server Error", 500));
    }
  };

  const getUserMenu = async (req, res) => {
    req.log?.info({ userId: req.auth.userId }, "UserRouter.getUserMenu");
    try {
      const menus = await userAccessMenuUsecase.getUserAccessibleMenus(
        req.auth.userId,
        { requestId: req.requestId, log: req.log }
      );
      return res.status(200).json(createResponse(menus, "list menu", 200, true, {total: menus.length, limit: menus.length, offset: 0}));
    } catch (error) {
      req.log?.error({ error: error.message }, "UserRouter.getUserMenu_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  };

  const getUserSidebar = async (req, res) => {
    req.log?.info({ userId: req.auth.userId }, "UserRouter.getUserSidebar");
    try {
      const sidebar = await userAccessMenuUsecase.getUserSidebarData(
        req.auth.userId,
        { requestId: req.requestId, log: req.log }
      );
      return res.status(200).json(createResponse(sidebar, "success", 200, true, {
        total: sidebar.length,
        limit: sidebar.length,
        offset: 0
      }));
    } catch (error) {
      req.log?.error({ error: error.message }, "UserRouter.getUserSidebar_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  };

  const checkMenuAccess = async (req, res) => {
    req.log?.info({ userId: req.auth.userId, url: req.query.url }, "UserRouter.checkMenuAccess");
    try {
      const { url } = req.query;
      if (!url) {
        return res.status(400).json(createResponse(null, "URL parameter is required", 400));
      }

      const hasAccess = await userAccessMenuUsecase.checkUserMenuAccessByUrl(
        req.auth.userId,
        url,
        'can_view',
        { requestId: req.requestId, log: req.log }
      );

      return res.status(200).json(createResponse({ hasAccess }, "success", 200, true));
    } catch (error) {
      req.log?.error({ error: error.message }, "UserRouter.checkMenuAccess_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  };

  const getDetailUserParam = [param("id").isUUID().withMessage("ID must be a valid UUID")];
  const getDetailUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    
    const userId = req.params.id;
    req.log?.info({ id: userId }, "UserRouter.getDetailUser");
    
    try {
      const user = await userUsecase.getUser(userId, {
        requestId: req.requestId,
        log: req.log,
        roleName: req.auth.roleName,
      });
      console.log(user)
      if (!user) {
        req.log?.warn({ userId }, "UserRouter.getDetailUser_not_found");
        return res.status(404).json(createResponse(null, "User not found", 404));
      }
      
      user.status = UserStatusIntToStr[user.status];
      return res.status(200).json(createResponse(user, "success", 200));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserRouter.getDetailUser_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  };

  const createUserParam = [
    body("email").isEmail().normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long")
      .matches(/[A-Z]/)
      .withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must contain at least one lowercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must contain at least one number")
      .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
      .withMessage("Password must contain at least one special character"),
    body("name").isString().notEmpty(),
    body("phone").notEmpty().isString(),
    body("gender").notEmpty().isString().isIn(["male", "female"]),
    body("status")
      .optional()
      .isIn(["active", "inactive", "pending", "suspended"]),
    body("roleId").isInt().notEmpty(),
    body("assetIds").optional().isArray(),
  ];

  const createUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errMsg = errors.array().map(err => err.msg).join(", ");
      return res.status(400).json(createResponse(null, errMsg, 400, false, {}, errors));
    }
    req.log?.info({ email: req.body.email }, "UserRouter.createUser");
    try {
      const user = await userUsecase.createUser(req.body, {
        requestId: req.requestId,
        log: req.log,
        userId: req.auth.userId,
      });
      if (user === "exists")
        return res
          .status(409)
          .json(createResponse(null, "User with this email already exists", 409));
      return res.status(201).json(createResponse(user, "success", 201));
    } catch (error) {
      req.log?.error({ error: error.message }, "UserRouter.createUser_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  };

  const updateUserParam = [
    param("id").isUUID().withMessage("ID must be a valid UUID"),
    body("email").optional().isEmail(),
    body("name").optional().isString().notEmpty(),
    body("gender").optional().isString().isIn(["male", "female"]),
    body("phone").optional().isString(),
    body("status")
      .optional()
      .isIn(["active", "inactive", "pending", "suspended"]),
    body("roleId").optional().isInt(),
    body("assetIds").optional().isArray(),
  ];

  const updateUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    try {
      const userId = req.params.id;
      req.log?.info({ id: userId, body: req.body }, "UserRouter.updateUser");
      
      // Log untuk debugging
      req.log?.info({ userId, type: typeof userId }, "UserRouter.updateUser_debug");
      
      const updatedUser = await userUsecase.updateUser(
        userId,
        req.body,
        {
          requestId: req.requestId,
          log: req.log,
          userId: req.auth.userId,
        }
      );
      
      if (!updatedUser) {
        req.log?.warn({ userId }, "UserRouter.updateUser_user_not_found");
        return res.status(404).json(createResponse(null, "User not found", 404));
      }
      
      if (updatedUser === "exists")
        return res
          .status(409)
          .json(createResponse(null, "User with this email already exists", 409));
          
      return res.status(202).json(createResponse(updatedUser, "success", 202));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserRouter.updateUser_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  };

  const getUserLogParam = [
    param("id").isUUID().withMessage("ID must be a valid UUID")
  ]

  const getUserLogs = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    
    const userId = req.params.id;
    req.log?.info({ id: userId }, "UserRouter.getUserLogs");
    
    try {
      req.log?.info({ userId }, "UserRouter.getUserLogs_calling_usecase");
      const userLogs = await userUsecase.getUserLogs(userId, {
        requestId: req.requestId,
        log: req.log,
        roleName: req.auth.roleName,
        userId: req.auth.userId
      });
      
      req.log?.info({ userId, logsCount: userLogs?.length || 0 }, "UserRouter.getUserLogs_usecase_result");
      
      if (!userLogs || userLogs.length === 0) {
        req.log?.warn({ userId }, "UserRouter.getUserLogs_not_found");
        return res.status(200).json(createResponse([], "success", 200, true, {
          total: 0, 
          limit: 0, 
          offset: 0
        }));
      }
      
      req.log?.info({ userId, logsCount: userLogs.length }, "UserRouter.getUserLogs_success");
      return res.status(200).json(createResponse(userLogs, "success", 200, true, {
        total: userLogs.length, 
        limit: userLogs.length, 
        offset: 0
      }));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserRouter.getUserLogs_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  }

  const getUserAssetsParam = [
    param("id").isUUID().withMessage("ID must be a valid UUID")
  ]

  const getUserAssets = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
    
    const userId = req.params.id;
    req.log?.info({ id: userId }, "UserRouter.getUserAssets");
    
    try {
      const userAssets = await userUsecase.getUserAssets(userId, {
        requestId: req.requestId,
        log: req.log,
        roleName: req.auth.roleName,
      });
      
      if (!userAssets) {
        req.log?.warn({ userId }, "UserRouter.getUserAssets_not_found");
        return res.status(404).json(createResponse(null, "User assets not found", 404));
      }
      
      return res.status(200).json(createResponse(userAssets, "success", 200, true, {
        total: userAssets.length, 
        limit: userAssets.length, 
        offset: 0
      }));
    } catch (error) {
      req.log?.error({ error: error.message, stack: error.stack }, "UserRouter.getUserAssets_error");
      return res.status(500).json(createResponse(null, "Internal Server Error", 500));
    }
  }
  router.use(authMiddleware, ensureRole);

  // GET /api/users - List all users
  router.get("/", getUsersParam, getUsers);
  // GET /api/users/permissions - Get current user permissions
  router.get("/permissions", getUserPermission);
  // GET /api/users/menus - Get user accessible menus
  router.get("/menus", getUserMenu);
  // GET /api/users/sidebar - Get user accessible sidebar
  router.get("/sidebar", getUserSidebar);
  // GET /api/users/check-menu-access - Check if user has access to menu by URL
  router.get("/check-menu-access", checkMenuAccess);
  // GET /api/users/:id/logs - Get user logs (must be before /:id route)
  router.get("/:id/logs", getUserLogParam, getUserLogs);
  // GET /api/users/:id/assets - Get user assets (must be before /:id route)
  router.get("/:id/assets", getUserAssetsParam, getUserAssets);
  // GET /api/users/:id - Get user by ID
  router.get("/:id", getDetailUserParam, getDetailUser);
  // POST /api/users - Create new user
  router.post("/", createUserParam, createUser);
  // PUT /api/users/:id - Update user
  router.put("/:id", updateUserParam, updateUser);

  // DELETE /api/users/:id - Delete user
  router.delete(
    "/:id",
    [param("id").isUUID().withMessage("ID must be a valid UUID")],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json(createResponse(null, "bad request", 400, false, {}, errors));
      
      const userId = req.params.id;
      req.log?.info({ id: userId }, "route_users_delete");
      
      try {
        const deleted = await userUsecase.deleteUser(userId, {
          requestId: req.requestId,
          log: req.log,
          userId: req.auth.userId,
        });
        
        if (!deleted) {
          req.log?.warn({ userId }, "route_users_delete_not_found");
          return res.status(404).json(createResponse(null, "User not found", 404));
        }
        
        if (deleted === "self")
          return res
            .status(400)
            .json(createResponse(null, "Cannot delete your own account", 400));
            
        return res.status(204).send();
      } catch (error) {
        req.log?.error({ error: error.message, stack: error.stack }, "route_users_delete_error");
        return res.status(500).json(createResponse(null, "Internal Server Error", 500));
      }
    }
  );

  return router;
}

module.exports = { InitUserRouter };
