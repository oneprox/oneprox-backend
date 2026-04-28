const sequelize = require('../models/sequelize');
const {
  ComplaintReportType,
  ComplaintReportStatusStrToInt,
  ComplaintReportStatusIntToStr,
  ComplaintReportPriorityStrToInt,
  ComplaintReportPriorityIntToStr,
} = require('../models/ComplaintReport');
const { transformEvidenceUrls, transformImageUrl } = require('../services/baseUrl');

class ComplaintReportUsecase {
  constructor(complaintReportRepository, userRepository, tenantRepository, complaintReportEvidenceRepository, complaintReportLogRepository) {
    this.complaintReportRepository = complaintReportRepository;
    this.userRepository = userRepository;
    this.tenantRepository = tenantRepository;
    this.complaintReportEvidenceRepository = complaintReportEvidenceRepository;
    this.complaintReportLogRepository = complaintReportLogRepository;
  }

  async createComplaintReport(data, ctx) {
    try {
      ctx.log?.info(data, 'ComplaintReportUsecase.createComplaintReport');

      // Get reporter user info to determine type
      const reporter = await this.userRepository.findById(data.reporter_id, ctx);
      if (!reporter) {
        throw new Error('Reporter user not found');
      }

      // Determine type based on reporter's role
      // Internal roles: admin, super_admin, security, cleaning
      const internalRoles = ['admin', 'super_admin', 'security', 'cleaning'];
      const reporterRoleName = reporter.role?.name?.toLowerCase();
      const isInternal = reporterRoleName && internalRoles.includes(reporterRoleName);

      let type = ComplaintReportType.COMPLAINT;
      let tenantId = null;

      if (isInternal) {
        type = ComplaintReportType.REPORT;
      } else {
        // For non-internal users, try to find their tenant record
        // If found, it's a complaint with tenant_id, otherwise still a complaint but without tenant_id
        try {
          const tenant = await this.tenantRepository.findAll({ user_id: data.reporter_id }, ctx);
          if (tenant.tenants && tenant.tenants.length > 0) {
            tenantId = tenant.tenants[0].id;
          }
        } catch (error) {
          ctx.log?.warn({ reporter_id: data.reporter_id, error: error.message }, 'Could not find tenant for reporter');
        }
        type = ComplaintReportType.COMPLAINT;
      }

      // Convert status and priority from string to int if provided
      const status = data.status !== undefined
        ? (typeof data.status === 'string' ? ComplaintReportStatusStrToInt[data.status] : data.status)
        : 0;
      const priority = data.priority !== undefined
        ? (typeof data.priority === 'string' ? ComplaintReportPriorityStrToInt[data.priority] : data.priority)
        : 1;

      const createData = {
        type,
        title: data.title,
        description: data.description,
        reporter_id: data.reporter_id,
        tenant_id: tenantId,
        asset_id: data.asset_id || null,
        status,
        priority,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      // Use transaction to ensure atomicity
      const result = await sequelize.transaction(async (tx) => {
        const transactionCtx = { ...ctx, transaction: tx };
        
        const complaintReport = await this.complaintReportRepository.create(createData, transactionCtx);
        
        // Handle evidences if provided
        if (data.evidences && Array.isArray(data.evidences) && data.evidences.length > 0) {
          for (const evidence of data.evidences) {
            // Normalize evidence format: accept both string (URL) and object with url property
            let evidenceUrl = null;
            if (typeof evidence === 'string') {
              evidenceUrl = evidence;
            } else if (evidence && typeof evidence === 'object' && evidence.url) {
              evidenceUrl = evidence.url;
            }
            
            if (evidenceUrl) {
              await this.complaintReportEvidenceRepository.create({
                complaint_report_id: complaintReport.id,
                url: evidenceUrl,
              }, transactionCtx, tx);
            }
          }
        }
        
        // Fetch the complaint report with evidences
        const complaintReportWithEvidences = await this.complaintReportRepository.findById(complaintReport.id, transactionCtx, tx);
        
        // Convert status and priority back to string for response
        const response = {
          ...complaintReportWithEvidences,
          status: ComplaintReportStatusIntToStr[complaintReportWithEvidences.status],
          priority: ComplaintReportPriorityIntToStr[complaintReportWithEvidences.priority],
        };
        
        // Transform evidence URLs
        if (response.evidences) {
          response.evidences = transformEvidenceUrls(response.evidences);
        }
        
        return response;
      });

      return result;
    } catch (error) {
      ctx.log?.error({ data, error: error.message, errorStack: error.stack }, 'ComplaintReportUsecase.createComplaintReport_error');
      throw error;
    }
  }

  async getComplaintReportById(id, ctx) {
    try {
      ctx.log?.info({ id }, 'ComplaintReportUsecase.getComplaintReportById');
      const complaintReport = await this.complaintReportRepository.findById(id, ctx);
      
      if (!complaintReport) {
        return null;
      }

      // Convert status and priority to string
      const result = {
        ...complaintReport,
        status: ComplaintReportStatusIntToStr[complaintReport.status],
        priority: ComplaintReportPriorityIntToStr[complaintReport.priority],
      };

      // Convert log status values to strings if logs exist
      if (result.logs && Array.isArray(result.logs)) {
        result.logs = result.logs.map(log => ({
          ...log,
          old_status: log.old_status !== null ? ComplaintReportStatusIntToStr[log.old_status] : null,
          new_status: ComplaintReportStatusIntToStr[log.new_status],
          photo_evidence_url: log.photo_evidence_url ? transformImageUrl(log.photo_evidence_url) : log.photo_evidence_url,
        }));
      }
      
      // Transform evidence URLs
      if (result.evidences) {
        result.evidences = transformEvidenceUrls(result.evidences);
      }

      return result;
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'ComplaintReportUsecase.getComplaintReportById_error');
      throw error;
    }
  }

  async getAllComplaintReports(filters = {}, ctx) {
    try {
      ctx.log?.info({ filters }, 'ComplaintReportUsecase.getAllComplaintReports');

      // Convert status and priority from string to int if provided
      const queryFilters = { ...filters };
      if (queryFilters.status !== undefined) {
        if (typeof queryFilters.status === 'string') {
          // Check if it's a string representation of a number
          const statusNum = parseInt(queryFilters.status, 10);
          if (!isNaN(statusNum)) {
            queryFilters.status = statusNum;
          } else {
            queryFilters.status = ComplaintReportStatusStrToInt[queryFilters.status];
          }
        }
        // If it's already a number, use it as is
      }
      if (queryFilters.priority !== undefined) {
        if (typeof queryFilters.priority === 'string') {
          // Check if it's a string representation of a number
          const priorityNum = parseInt(queryFilters.priority, 10);
          if (!isNaN(priorityNum)) {
            queryFilters.priority = priorityNum;
          } else {
            queryFilters.priority = ComplaintReportPriorityStrToInt[queryFilters.priority];
          }
        }
        // If it's already a number, use it as is
      }

      const result = await this.complaintReportRepository.findAll(queryFilters, ctx);

      // Convert status and priority to string for each item
      const complaintReports = result.complaintReports.map(cr => {
        const converted = {
          ...cr,
          status: ComplaintReportStatusIntToStr[cr.status],
          priority: ComplaintReportPriorityIntToStr[cr.priority],
        };

        // Convert log status values to strings if logs exist
        if (converted.logs && Array.isArray(converted.logs)) {
          converted.logs = converted.logs.map(log => ({
            ...log,
            old_status: log.old_status !== null ? ComplaintReportStatusIntToStr[log.old_status] : null,
            new_status: ComplaintReportStatusIntToStr[log.new_status],
            photo_evidence_url: log.photo_evidence_url ? transformImageUrl(log.photo_evidence_url) : log.photo_evidence_url,
          }));
        }
        
        // Transform evidence URLs
        if (converted.evidences) {
          converted.evidences = transformEvidenceUrls(converted.evidences);
        }

        return converted;
      });

      return {
        complaintReports,
        total: result.total
      };
    } catch (error) {
      ctx.log?.error({ filters, error: error.message }, 'ComplaintReportUsecase.getAllComplaintReports_error');
      throw error;
    }
  }

  async updateComplaintReport(id, data, ctx) {
    try {
      ctx.log?.info({ id, data }, 'ComplaintReportUsecase.updateComplaintReport');

      const existing = await this.complaintReportRepository.findById(id, ctx);
      if (!existing) {
        throw new Error('Complaint/Report not found');
      }

      // Only status can be updated - reject any other fields
      if (data.title !== undefined || data.description !== undefined || 
          data.priority !== undefined || data.evidences !== undefined ||
          data.reporter_id !== undefined || data.tenant_id !== undefined) {
        throw new Error('Only status can be updated. Title, description, priority, and evidences cannot be modified.');
      }

      // Status is required
      if (data.status === undefined) {
        throw new Error('Status is required');
      }

      // Notes are required
      if (!data.status_update_notes || !data.status_update_notes.trim()) {
        throw new Error('Notes are required');
      }

      // Photo evidence is required
      if (!data.status_update_photo_evidence || !data.status_update_photo_evidence.trim()) {
        throw new Error('Photo evidence is required');
      }

      // Convert status from string to int if provided
      const oldStatus = existing.status;
      let newStatus;
      
      if (typeof data.status === 'string') {
        newStatus = ComplaintReportStatusStrToInt[data.status];
      } else {
        newStatus = data.status;
      }

      // Check if status is being changed
      const isStatusChange = oldStatus !== newStatus;

      // Use transaction to ensure atomicity
      const result = await sequelize.transaction(async (tx) => {
        const transactionCtx = { ...ctx, transaction: tx };
        
        // Only update status
        const updateData = {
          status: newStatus,
          updated_by: ctx.userId,
        };
        
        const updated = await this.complaintReportRepository.update(id, updateData, transactionCtx);
        
        // Create log entry with notes and photo evidence
        if (this.complaintReportLogRepository) {
          await this.complaintReportLogRepository.create({
            complaint_report_id: id,
            old_status: oldStatus,
            new_status: newStatus,
            notes: data.status_update_notes,
            photo_evidence_url: data.status_update_photo_evidence,
            created_by: ctx.userId,
          }, transactionCtx, tx);
        }
        
        // Fetch the updated complaint report with evidences and logs
        const updatedWithEvidences = await this.complaintReportRepository.findById(id, transactionCtx, tx);
        
        // Convert status and priority back to string
        const result = {
          ...updatedWithEvidences,
          status: ComplaintReportStatusIntToStr[updatedWithEvidences.status],
          priority: ComplaintReportPriorityIntToStr[updatedWithEvidences.priority],
        };

        // Convert log status values to strings if logs exist
        if (result.logs && Array.isArray(result.logs)) {
          result.logs = result.logs.map(log => ({
            ...log,
            old_status: log.old_status !== null ? ComplaintReportStatusIntToStr[log.old_status] : null,
            new_status: ComplaintReportStatusIntToStr[log.new_status],
            photo_evidence_url: log.photo_evidence_url ? transformImageUrl(log.photo_evidence_url) : log.photo_evidence_url,
          }));
        }
        
        // Transform evidence URLs
        if (result.evidences) {
          result.evidences = transformEvidenceUrls(result.evidences);
        }

        return result;
      });

      return result;
    } catch (error) {
      ctx.log?.error({ id, data, error: error.message }, 'ComplaintReportUsecase.updateComplaintReport_error');
      throw error;
    }
  }

  async deleteComplaintReport(id, ctx) {
    try {
      ctx.log?.info({ id }, 'ComplaintReportUsecase.deleteComplaintReport');

      // Get the complaint report to check permissions and status
      const complaintReport = await this.complaintReportRepository.findById(id, ctx);
      if (!complaintReport) {
        throw new Error('Complaint/Report not found');
      }

      // Check if current user is the creator
      if (complaintReport.created_by !== ctx.userId) {
        throw new Error('Only the user who created the complaint/report can delete it');
      }

      // Check if status is pending (0) or in_progress (1)
      const status = complaintReport.status;
      if (status !== 0 && status !== 1) {
        throw new Error('Complaint/Report can only be deleted when status is pending or in_progress');
      }

      // Proceed with deletion
      const result = await this.complaintReportRepository.delete(id, ctx);
      return result;
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'ComplaintReportUsecase.deleteComplaintReport_error');
      throw error;
    }
  }

  async getComplaintReportLogs(id, ctx) {
    try {
      ctx.log?.info({ id }, 'ComplaintReportUsecase.getComplaintReportLogs');

      // Verify complaint report exists
      const complaintReport = await this.complaintReportRepository.findById(id, ctx);
      if (!complaintReport) {
        throw new Error('Complaint/Report not found');
      }

      // Get logs
      if (!this.complaintReportLogRepository) {
        throw new Error('Log repository not available');
      }

      const logs = await this.complaintReportLogRepository.findByComplaintReportId(id, ctx);

      // Convert status values to strings
      const convertedLogs = logs.map(log => ({
        ...log,
        old_status: log.old_status !== null ? ComplaintReportStatusIntToStr[log.old_status] : null,
        new_status: ComplaintReportStatusIntToStr[log.new_status],
        photo_evidence_url: log.photo_evidence_url ? transformImageUrl(log.photo_evidence_url) : log.photo_evidence_url,
      }));

      return convertedLogs;
    } catch (error) {
      ctx.log?.error({ id, error: error.message }, 'ComplaintReportUsecase.getComplaintReportLogs_error');
      throw error;
    }
  }
}

module.exports = ComplaintReportUsecase;

