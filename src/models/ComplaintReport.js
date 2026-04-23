const { DataTypes, Model } = require('sequelize');
const sequelize = require('./sequelize');

class ComplaintReport extends Model {}

const ComplaintReportType = {
  COMPLAINT: 'complaint',
  REPORT: 'report'
};

const ComplaintReportStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

const ComplaintReportStatusStrToInt = {
  'pending': 0,
  'in_progress': 1,
  'resolved': 2,
  'closed': 3
};

const ComplaintReportStatusIntToStr = {
  0: 'pending',
  1: 'in_progress',
  2: 'resolved',
  3: 'closed'
};

const ComplaintReportPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

const ComplaintReportPriorityStrToInt = {
  'low': 0,
  'medium': 1,
  'high': 2,
  'urgent': 3
};

const ComplaintReportPriorityIntToStr = {
  0: 'low',
  1: 'medium',
  2: 'high',
  3: 'urgent'
};

ComplaintReport.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  type: {
    type: DataTypes.ENUM('complaint', 'report'),
    allowNull: false,
    comment: 'complaint if reporter is tenant, report if reporter is internal (admin, super_admin, security, cleaning)'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  reporter_id: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'User ID of the person making the complaint/report'
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Tenant ID (only for complaints, null for reports)'
  },
  asset_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Asset ID related to complaint/report'
  },
  status: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // pending
    allowNull: false,
    comment: 'Status: 0=pending, 1=in_progress, 2=resolved, 3=closed'
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 1, // medium
    allowNull: false,
    comment: 'Priority: 0=low, 1=medium, 2=high, 3=urgent'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  modelName: 'ComplaintReport',
  tableName: 'complaint_reports',
  timestamps: false,
});

ComplaintReport.associate = (models) => {
  ComplaintReport.belongsTo(models.User, {
    foreignKey: 'reporter_id',
    as: 'reporter',
  });
  ComplaintReport.belongsTo(models.Tenant, {
    foreignKey: 'tenant_id',
    as: 'tenant',
  });
  ComplaintReport.belongsTo(models.Asset, {
    foreignKey: 'asset_id',
    as: 'asset',
  });
  ComplaintReport.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'createdBy',
  });
  ComplaintReport.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updatedBy',
  });
  ComplaintReport.hasMany(models.ComplaintReportEvidence, {
    foreignKey: 'complaint_report_id',
    as: 'evidences',
  });
  ComplaintReport.hasMany(models.ComplaintReportLog, {
    foreignKey: 'complaint_report_id',
    as: 'logs',
  });
};

module.exports = {
  ComplaintReport,
  ComplaintReportType,
  ComplaintReportStatus,
  ComplaintReportStatusStrToInt,
  ComplaintReportStatusIntToStr,
  ComplaintReportPriority,
  ComplaintReportPriorityStrToInt,
  ComplaintReportPriorityIntToStr,
};

