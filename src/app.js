const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// define routes module
const auth = require('./routes/auth');
const asset = require('./routes/assets');
const user = require('./routes/users');
const units = require('./routes/units');
const tenant = require('./routes/tenants');
const taskRoute = require('./routes/tasks');
const uploadsRouter = require('./routes/uploads');
const { InitAttendanceRouter } = require('./routes/attendances');
const { InitRoleRouter } = require('./routes/roles');
const { InitMenuRouter } = require('./routes/menus');
const { InitScanInfoRouter } = require('./routes/scanInfos');
const { InitTaskGroupRouter } = require('./routes/taskGroups');
const { InitComplaintReportRouter } = require('./routes/complaintReports');
const { InitInternalRouter } = require('./routes/internal');
const { InitSettingsRouter } = require('./routes/settings');
const { requestContext } = require('./middleware/requestContext');
const { metricsMiddleware, metricsHandler } = require('./services/metrics');

const app = express();
// define repository module
const UserRepository = require('./repositories/User');
const PasswordResetTokenRepository = require('./repositories/PasswordResetToken');
const AssetRepository = require('./repositories/Asset');
const AssetLogRepository = require('./repositories/AssetLog');
const UnitRepository = require('./repositories/Unit');
const RoleRepository = require('./repositories/Role');
const TenantRepository = require('./repositories/Tenant');
const TenantAttachmentRepository = require('./repositories/TenantAttachment');
const MapTenantCategoryRepository = require('./repositories/MapTenantCategory');
const TenantUnitRepository = require('./repositories/TenantUnit');
const TenantAssetRepository = require('./repositories/TenantAsset');
const MenuRepository = require('./repositories/Menu');
const AssetAttachmentRepository = require('./repositories/AssetAttachment');
const UnitAttachmentRepository = require('./repositories/UnitAttachment');
const TenantCategoryRepository = require('./repositories/TenantCategory');
const UserAccessMenuRepository = require('./repositories/UserAccessMenu');
const UserLogRepository = require('./repositories/UserLog');
const UnitLogRepository = require('./repositories/UnitLog');
const TenantLogRepository = require('./repositories/TenantLog');
const DepositoLogRepository = require('./repositories/DepositoLog');
const ComplaintReportRepository = require('./repositories/ComplaintReport');
const ComplaintReportEvidenceRepository = require('./repositories/ComplaintReportEvidence');
const ComplaintReportLogRepository = require('./repositories/ComplaintReportLog');
const AttendanceRepository = require('./repositories/Attendance');
const UserAssetRepository = require('./repositories/UserAsset');
const TaskRepository = require('./repositories/Task');
const TaskScheduleRepository = require('./repositories/TaskSchedule');
const TaskLogRepository = require('./repositories/TaskLog');
const TaskGroupRepository = require('./repositories/TaskGroup');
const TaskParentRepository = require('./repositories/TaskParent');
const ScanInfoRepository = require('./repositories/ScanInfo');
const UserTaskRepository = require('./repositories/UserTask');
const UserTaskEvidenceRepository = require('./repositories/UserTaskEvidence');
const TenantPaymentLogRepository = require('./repositories/TenantPaymentLog');
const TenantLegalRepository = require('./repositories/TenantLegal');
const SettingsRepository = require('./repositories/Settings');

// define usecase module
const authUc = require('./usecases/Auth');
const assetUc = require('./usecases/Asset');
const userUc = require('./usecases/User');
const unitUc = require('./usecases/Unit');
const tenantUc = require('./usecases/Tenant');
const roleUc = require('./usecases/Role');
const menuUc = require('./usecases/Menu');
const userAccessMenuUc = require('./usecases/UserAccessMenu');
const taskUc = require('./usecases/Task');
const taskGroupUc = require('./usecases/TaskGroup');
const userTaskUc = require('./usecases/UserTask');
const scanInfoUc = require('./usecases/ScanInfo');
const complaintReportUc = require('./usecases/ComplaintReport');
const attendanceUc = require('./usecases/Attendance');
const tenantPaymentLogUc = require('./usecases/TenantPaymentLog');
const tenantLegalUc = require('./usecases/TenantLegal');
const settingsUc = require('./usecases/Settings');

// define models database
const {User} = require('./models/User');
const modelRole = require('./models/Role');
const {Asset} = require('./models/Asset');
const modelAssetLog = require('./models/AssetLog');
const { Unit: modelUnit } = require('./models/Unit');
const modelAdminAsset = require('./models/AssetAdmin');
const modelPasswordResetToken = require('./models/PasswordResetToken');
const { Tenant } = require('./models/Tenant');
const {TenantAttachmentModel} = require('./models/TenantAttachment');
const MapTenantCategory = require('./models/MapTenantCategory');
const modelTenantUnit = require('./models/TenantUnit');
const modelTenantAsset = require('./models/TenantAsset');
const modelMenu = require('./models/Menu');
const modelRoleMenuPermission = require('./models/RoleMenuPermission');
const { AssetAttachment } = require('./models/AssetAttachment');
const modelUnitAttachment = require('./models/UnitAttachment');
const modelTenantCategory = require('./models/TenantCategory');
const modelUserLog = require('./models/UserLog');
const modelUnitLog = require('./models/UnitLog');
const modelTenantLog = require('./models/TenantLog');
const modelDepositoLog = require('./models/DepositoLog');
const { ComplaintReport } = require('./models/ComplaintReport');
const modelComplaintReportEvidence = require('./models/ComplaintReportEvidence');
const modelComplaintReportLog = require('./models/ComplaintReportLog');
const modelUserAsset = require('./models/UserAsset');
const modelTask = require('./models/Task');
const modelTaskSchedule = require('./models/TaskSchedule');
const modelTaskLog = require('./models/TaskLog');
const modelScanInfo = require('./models/ScanInfo');
const modelTaskGroup = require('./models/TaskGroup');
const modelTaskParent = require('./models/TaskParent');
const modelUserTask = require('./models/UserTask');
const modelUserTaskEvidence = require('./models/UserTaskEvidence');
const { TenantPaymentLog: modelTenantPaymentLog } = require('./models/TenantPaymentLog');
const TenantLegal = require('./models/TenantLegal');
const Settings = require('./models/Settings');

// initialize repository
const userRepository = new UserRepository(User, modelRole);
const tokenRepository = new PasswordResetTokenRepository(modelPasswordResetToken);
const assetRepository = new AssetRepository(Asset, modelAdminAsset, User);
const assetLogRepository = new AssetLogRepository(modelAssetLog, User);
const unitRepository = new UnitRepository(modelUnit, Asset, User);
const roleRepository = new RoleRepository(modelRole, modelRoleMenuPermission);
const tenantRepository = new TenantRepository(Tenant, User, modelTenantCategory);
const tenantAttachmentRepository = new TenantAttachmentRepository(TenantAttachmentModel)
const mapTenantCategoryRepository = new MapTenantCategoryRepository(MapTenantCategory)
const tenantUnitRepository = new TenantUnitRepository(modelTenantUnit)
const tenantAssetRepository = new TenantAssetRepository(modelTenantAsset)
const menuRepository = new MenuRepository(modelMenu)
const assetAttachmentRepository = new AssetAttachmentRepository(AssetAttachment);
const unitAttachmentRepository = new UnitAttachmentRepository(modelUnitAttachment);
const tenantCategoryRepository = new TenantCategoryRepository(modelTenantCategory);
const userAccessMenuRepository = new UserAccessMenuRepository(User, modelRole, modelRoleMenuPermission, modelMenu);
const userLogRepository = new UserLogRepository(modelUserLog, User, modelRole)
const unitLogRepository = new UnitLogRepository(modelUnitLog, User)
const tenantLogRepository = new TenantLogRepository(modelTenantLog, User);
const depositoLogRepository = new DepositoLogRepository(modelDepositoLog, User);
const complaintReportLogRepository = new ComplaintReportLogRepository(modelComplaintReportLog, User);
const complaintReportRepository = new ComplaintReportRepository(ComplaintReport, User, Tenant, modelComplaintReportEvidence, modelComplaintReportLog);
const complaintReportEvidenceRepository = new ComplaintReportEvidenceRepository(modelComplaintReportEvidence, ComplaintReport);
const userAssetRepository = new UserAssetRepository(modelUserAsset);
const taskRepository = new TaskRepository(modelTask, User, modelRole, Asset, modelTaskGroup, modelTaskParent);
const taskScheduleRepository = new TaskScheduleRepository(modelTaskSchedule);
const taskLogRepository = new TaskLogRepository(modelTaskLog, User);
const taskGroupRepository = new TaskGroupRepository(modelTaskGroup, modelTask, modelUserTask, modelTaskParent, User);
const taskParentRepository = new TaskParentRepository(modelTaskParent);
const scanInfoRepository = new ScanInfoRepository(modelScanInfo, User, Asset);
const userTaskRepository = new UserTaskRepository(modelUserTask, User, modelTask, modelUserTaskEvidence, modelTaskSchedule, modelTaskGroup, modelTaskParent);
const userTaskEvidenceRepository = new UserTaskEvidenceRepository(modelUserTaskEvidence, modelUserTask);
const tenantPaymentLogRepository = new TenantPaymentLogRepository(modelTenantPaymentLog, Tenant, User);
const tenantLegalRepository = new TenantLegalRepository(TenantLegal, Tenant, User);
const settingsRepository = new SettingsRepository(Settings);

// Setup model associations
const models = {
  User: User,
  Role: modelRole,
  Menu: modelMenu,
  RoleMenuPermission: modelRoleMenuPermission,
  Asset: Asset,
  AssetLog: modelAssetLog,
  Unit: modelUnit,
  AssetAdmin: modelAdminAsset,
  PasswordResetToken: modelPasswordResetToken,
  Tenant: Tenant,
  TenantAttachment: TenantAttachmentModel,
  MapTenantCategory: MapTenantCategory,
  TenantUnit: modelTenantUnit,
  TenantAsset: modelTenantAsset,
  AssetAttachment: AssetAttachment,
  UnitAttachment: modelUnitAttachment,
  TenantCategory: modelTenantCategory,
  UserLog: modelUserLog,
  UnitLog: modelUnitLog,
  TenantLog: modelTenantLog,
  DepositoLog: modelDepositoLog,
  ComplaintReport: ComplaintReport,
  ComplaintReportEvidence: modelComplaintReportEvidence,
  ComplaintReportLog: modelComplaintReportLog,
  UserAsset: modelUserAsset,
  Task: modelTask,
  TaskSchedule: modelTaskSchedule,
  TaskLog: modelTaskLog,
  ScanInfo: modelScanInfo,
  TaskGroup: modelTaskGroup,
  TaskParent: modelTaskParent,
  UserTask: modelUserTask,
  UserTaskEvidence: modelUserTaskEvidence,
  TenantPaymentLog: modelTenantPaymentLog,
  TenantLegal: TenantLegal,
  Settings: Settings,
};

// Setup associations
Object.keys(models).forEach(modelName => {
  if (!models[modelName]) {
    console.error(`Model ${modelName} is undefined!`);
    return;
  }
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// initialize usecase
const assetUsecase = new assetUc(assetRepository, assetLogRepository, assetAttachmentRepository, unitRepository);
const authUsecase = new authUc(
  userRepository,
  process.env.JWT_SECRET,
  process.env.TOKEN_TTL || '1h',
  process.env.APP_BASE_URL || 'http://localhost:3000',
  tokenRepository,
  roleRepository,
  userAssetRepository,
);
const userUsecase = new userUc(userRepository, userLogRepository, userAssetRepository);
const unitUsecase = new unitUc(unitRepository, unitAttachmentRepository, unitLogRepository);
const tenantUsecase = new tenantUc(tenantRepository, tenantAttachmentRepository, tenantUnitRepository, tenantAssetRepository, mapTenantCategoryRepository, tenantCategoryRepository, unitRepository, tenantLogRepository, depositoLogRepository, userUsecase, tenantPaymentLogRepository, tenantLegalRepository, settingsRepository);
const roleUsecase = new roleUc(roleRepository);
const menuUsecase = new menuUc(menuRepository);
const userAccessMenuUsecase = new userAccessMenuUc(userAccessMenuRepository);
const taskUsecase = new taskUc(taskRepository, taskScheduleRepository, taskLogRepository, taskParentRepository);
const taskGroupUsecase = new taskGroupUc(taskGroupRepository);
const userTaskUsecase = new userTaskUc(userTaskRepository, taskRepository, taskScheduleRepository, userTaskEvidenceRepository);
const scanInfoUsecase = new scanInfoUc(scanInfoRepository);
const complaintReportUsecase = new complaintReportUc(complaintReportRepository, userRepository, tenantRepository, complaintReportEvidenceRepository, complaintReportLogRepository);
const attendanceRepository = new AttendanceRepository();
const attendanceUsecase = new attendanceUc(attendanceRepository);
const tenantPaymentLogUsecase = new tenantPaymentLogUc(tenantPaymentLogRepository, tenantRepository);
const tenantLegalUsecase = new tenantLegalUc(tenantLegalRepository, tenantRepository, settingsRepository);
const settingsUsecase = new settingsUc(settingsRepository, tenantRepository, tenantLegalRepository);
const DashboardUsecase = require('./usecases/Dashboard');
const dashboardUsecase = new DashboardUsecase(
  complaintReportRepository,
  tenantRepository,
  userRepository,
  userTaskRepository,
  attendanceRepository,
  tenantUnitRepository,
  unitRepository,
  assetRepository,
  tenantPaymentLogRepository,
  tenantLegalRepository,
  settingsRepository
);

// initalize router
const authRouter = auth.InitAuthRouter(authUsecase);
const assetRouter = asset.InitAssetRouter(assetUsecase);
const userRouter = user.InitUserRouter(userUsecase, userAccessMenuUsecase);
const unitRouter = units.InitUnitRouter(unitUsecase);
const tenantRouter = tenant.InitTenantRouter(tenantUsecase, tenantPaymentLogUsecase, tenantLegalUsecase);
const roleRouter = InitRoleRouter(roleUsecase);
const menuRouter = InitMenuRouter(menuUsecase);
const attendanceRouter = InitAttendanceRouter(attendanceUsecase);
const uploadFileRouter = uploadsRouter.InitUploadRouter();
const taskRouter = taskRoute.InitTaskRouter(taskUsecase);
const taskGroupRouter = InitTaskGroupRouter(taskGroupUsecase);
const scanInfoRouter = InitScanInfoRouter(scanInfoUsecase);
const complaintReportRouter = InitComplaintReportRouter(complaintReportUsecase);
const userTaskRouter = require('./routes/userTasks').InitUserTaskRouter(userTaskUsecase);
const { InitDashboardRouter } = require('./routes/dashboard');
const dashboardRouter = InitDashboardRouter(dashboardUsecase);
const internalRouter = InitInternalRouter({
  tenantRepository,
  tenantPaymentLogRepository,
  userTaskEvidenceRepository,
  userTaskUsecase,
});
const settingsRouter = InitSettingsRouter(settingsUsecase);

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3002', 'https://oripro-frontend-eight.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(requestContext);
app.use(metricsMiddleware);
app.use(express.json());
app.use(
  morgan((tokens, req, res) => {
    const rid = req.requestId || '-';
    return JSON.stringify({
      ts: new Date().toISOString(),
      level: 'http',
      requestId: rid,
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: Number(tokens.status(req, res)),
      request: req.body,
      length: tokens.res(req, res, 'content-length'),
      responseMs: Number(tokens['response-time'](req, res))
    });
  })
);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

// Database connection test endpoint (for debugging)
app.get('/health/db', async (_req, res) => {
  try {
    const sequelize = require('./models/sequelize');
    await sequelize.authenticate();
    
    // Try to extract connection info from sequelize config
    const config = sequelize.config || {};
    const dialectOpts = config.dialectOptions || {};
    
    // Parse connection string if available (hide password)
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURI || '';
    let safeUrl = 'not set';
    let parsedHost = 'unknown';
    let parsedDatabase = 'unknown';
    
    if (dbUrl) {
      try {
        const url = new URL(dbUrl);
        parsedHost = url.hostname;
        parsedDatabase = url.pathname?.replace('/', '') || 'unknown';
        safeUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
      } catch (e) {
        safeUrl = 'malformed';
      }
    }
    
    res.json({ 
      status: 'ok', 
      message: 'Database connection successful',
      connection: {
        method: dbUrl ? 'connection string' : 'individual variables',
        url: safeUrl,
        host: parsedHost,
        database: parsedDatabase,
        port: config.port || 5432,
        ssl: {
          enabled: !!dialectOpts.ssl,
          require: dialectOpts.ssl?.require || false,
          rejectUnauthorized: dialectOpts.ssl?.rejectUnauthorized !== undefined ? dialectOpts.ssl.rejectUnauthorized : 'unknown',
        }
      }
    });
  } catch (error) {
    // Parse connection info even on error
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURI || '';
    let safeUrl = 'not set';
    let parsedHost = 'unknown';
    let parsedDatabase = 'unknown';
    
    if (dbUrl) {
      try {
        const url = new URL(dbUrl);
        parsedHost = url.hostname;
        parsedDatabase = url.pathname?.replace('/', '') || 'unknown';
        safeUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
      } catch (e) {
        safeUrl = 'malformed';
        parsedHost = 'parse error';
      }
    }
    
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: {
        name: error.name,
        message: error.message,
        code: error.parent?.code,
        errno: error.parent?.errno,
        syscall: error.parent?.syscall,
        hostname: error.parent?.hostname,
      },
      connection: {
        method: dbUrl ? 'connection string' : 'individual variables',
        url: safeUrl,
        host: parsedHost,
        database: parsedDatabase,
        urlSet: !!dbUrl,
        note: dbUrl ? 'Using DATABASE_URL/POSTGRES_URL/PGURI' : 'DATABASE_URL not set - using individual variables'
      }
    });
  }
});
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, path) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), {
  setHeaders: (res, path) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Disable caching for all non-static GET responses
// (Placed AFTER express.static so static files can keep their caching behavior)
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/assets', assetRouter);
app.use('/api/users', userRouter);
app.use('/api/units', unitRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/task-groups', taskGroupRouter);
app.use('/api/roles', roleRouter);
app.use('/api/menus', menuRouter);
app.use('/api/uploads', uploadFileRouter);
app.use('/api/scan-infos', scanInfoRouter);
app.use('/api/user-tasks', userTaskRouter);
app.use('/api/complaint-reports', complaintReportRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/attendances', attendanceRouter);
app.use('/api/internal', internalRouter);
app.use('/api/settings', settingsRouter);
app.get('/metrics', metricsHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Log the full error for debugging
  console.error('Unhandled error:', err);
  
  // Ensure we never send headers after they've been sent
  if (res.headersSent) {
    return _next(err);
  }
  
  // Send error response
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ message });
});

// Handle unhandled promise rejections globally
// This is critical for Vercel serverless functions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, but log it
});


// Only start server when not running on Vercel
// Vercel serverless functions don't need app.listen()
if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
