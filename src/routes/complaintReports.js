const { Router } = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authMiddleware, ensureRole } = require('../middleware/auth');
const { createResponse } = require('../services/response');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { compressUploadedImages } = require('../middleware/imageCompressor');

function InitComplaintReportRouter(complaintReportUsecase) {
  const router = Router();

  router.use(authMiddleware, ensureRole);

  // Multer configuration for status update photo evidence
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadPath = path.join(__dirname, '../../public/uploads/complaint-report-status');
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const name = Date.now() + '_' + Math.random().toString(36).substring(7) + ext;
      cb(null, name);
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
  });

  const createComplaintReportParam = [
    body('title').isString().notEmpty().withMessage('title is required'),
    body('description').isString().notEmpty().withMessage('description is required'),
    body('reporter_id').isUUID().notEmpty().withMessage('reporter_id must be a valid UUID'),
    body('asset_id').optional().isUUID().withMessage('asset_id must be a valid UUID'),
    body('status').optional().custom((value) => {
      // Accept string status values or integer status values (0-3)
      if (typeof value === 'string') {
        return ['pending', 'in_progress', 'resolved', 'closed'].includes(value);
      } else if (typeof value === 'number') {
        return value >= 0 && value <= 3;
      }
      return false;
    }).withMessage('status must be one of: pending, in_progress, resolved, closed (or 0-3)'),
    body('priority').optional().custom((value) => {
      // Accept string priority values or integer priority values (0-3)
      if (typeof value === 'string') {
        return ['low', 'medium', 'high', 'urgent'].includes(value);
      } else if (typeof value === 'number') {
        return value >= 0 && value <= 3;
      }
      return false;
    }).withMessage('priority must be one of: low, medium, high, urgent (or 0-3)'),
    body('evidences').optional().isArray().withMessage('evidences must be an array'),
  ];

  async function createComplaintReport(req, res) {
    try {
      req.log?.info({ body: req.body }, 'ComplaintReportRouter.createComplaintReport');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, errors.array()));
      }

      const complaintReport = await complaintReportUsecase.createComplaintReport(req.body, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(201).json(createResponse(complaintReport, 'Complaint/Report created successfully', 201));
    } catch (error) {
      req.log?.error({ error: error.message, errorStack: error.stack }, 'ComplaintReportRouter.createComplaintReport_error');
      return res.status(500).json(createResponse(null, 'internal server error', 500));
    }
  }

  const getComplaintReportParam = [
    param('id').isInt().notEmpty().withMessage('id must be an integer'),
  ];

  async function getComplaintReportById(req, res) {
    try {
      req.log?.info({ id: req.params.id }, 'ComplaintReportRouter.getComplaintReportById');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, errors.array()));
      }

      const complaintReport = await complaintReportUsecase.getComplaintReportById(req.params.id, {
        userId: req.auth?.userId,
        log: req.log,
      });

      if (!complaintReport) {
        return res.status(404).json(createResponse(null, 'Complaint/Report not found', 404));
      }

      return res.status(200).json(createResponse(complaintReport, 'success', 200));
    } catch (error) {
      req.log?.error({ error: error.message }, 'ComplaintReportRouter.getComplaintReportById_error');
      return res.status(500).json(createResponse(null, 'internal server error', 500));
    }
  }

  const getAllComplaintReportsParam = [
    query('type').optional().isIn(['complaint', 'report']).withMessage('type must be complaint or report'),
    query('status').optional().custom((value) => {
      // Accept string status values or integer status values (0-3)
      if (typeof value === 'string') {
        return ['pending', 'in_progress', 'resolved', 'closed'].includes(value);
      } else {
        // Query parameters come as strings, so check if it's a valid integer string
        const numValue = parseInt(value, 10);
        return !isNaN(numValue) && numValue >= 0 && numValue <= 3;
      }
    }).withMessage('status must be one of: pending, in_progress, resolved, closed (or 0-3)'),
    query('priority').optional().custom((value) => {
      // Accept string priority values or integer priority values (0-3)
      if (typeof value === 'string') {
        return ['low', 'medium', 'high', 'urgent'].includes(value);
      } else {
        // Query parameters come as strings, so check if it's a valid integer string
        const numValue = parseInt(value, 10);
        return !isNaN(numValue) && numValue >= 0 && numValue <= 3;
      }
    }).withMessage('priority must be one of: low, medium, high, urgent (or 0-3)'),
    query('reporter_id').optional().isUUID().withMessage('reporter_id must be a valid UUID'),
    query('tenant_id').optional().isUUID().withMessage('tenant_id must be a valid UUID'),
    query('title').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset must be a non-negative integer'),
  ];

  async function getAllComplaintReports(req, res) {
    try {
      req.log?.info({ query: req.query }, 'ComplaintReportRouter.getAllComplaintReports');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, errors.array()));
      }

      // Disable caching
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      const filters = {};
      if (req.query.type) filters.type = req.query.type;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.priority) filters.priority = req.query.priority;
      if (req.query.reporter_id) filters.reporter_id = req.query.reporter_id;
      if (req.query.tenant_id) filters.tenant_id = req.query.tenant_id;
      if (req.query.title) filters.title = req.query.title;
      if (req.query.limit) filters.limit = parseInt(req.query.limit);
      if (req.query.offset) filters.offset = parseInt(req.query.offset);

      const result = await complaintReportUsecase.getAllComplaintReports(filters, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(createResponse(result.complaintReports, 'success', 200, true, {
        total: result.total,
        limit: filters.limit || result.total,
        offset: filters.offset || 0
      }));
    } catch (error) {
      req.log?.error({ error: error.message }, 'ComplaintReportRouter.getAllComplaintReports_error');
      return res.status(500).json(createResponse(null, 'internal server error', 500));
    }
  }

  const updateComplaintReportParam = [
    param('id').isInt().notEmpty().withMessage('id must be an integer'),
    body('status').notEmpty().custom((value) => {
      // Accept string status values or integer status values (0-3)
      if (typeof value === 'string') {
        return ['pending', 'in_progress', 'resolved', 'closed'].includes(value);
      } else if (typeof value === 'number') {
        return value >= 0 && value <= 3;
      }
      return false;
    }).withMessage('status is required and must be one of: pending, in_progress, resolved, closed (or 0-3)'),
    body('notes').isString().notEmpty().withMessage('notes are required'),
    body('photo_evidence').optional().custom((value) => {
      // Accept string URL or file will be uploaded
      if (value && typeof value === 'string') {
        return value.length > 0;
      }
      return true; // Allow if not provided (file upload will be handled separately)
    }).withMessage('photo_evidence must be a non-empty URL string if provided'),
  ];

  async function updateComplaintReport(req, res) {
    try {
      req.log?.info({ id: req.params.id, body: req.body, file: req.file }, 'ComplaintReportRouter.updateComplaintReport');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, errors.array()));
      }

      // Prepare update data - only status can be updated
      const updateData = {
        status: req.body.status,
        status_update_notes: req.body.notes,
      };

      // Handle file upload for photo evidence
      if (req.file) {
        const host = req.protocol + '://' + req.get('host');
        const fileUrl = `${host}/uploads/complaint-report-status/${req.file.filename}`;
        updateData.status_update_photo_evidence = fileUrl;
      } else if (req.body.photo_evidence && typeof req.body.photo_evidence === 'string') {
        // If photo_evidence is provided as a string (URL), use it directly
        updateData.status_update_photo_evidence = req.body.photo_evidence;
      } else {
        // Photo evidence is required
        return res.status(400).json(createResponse(null, 'Photo evidence is required', 400));
      }

      const updated = await complaintReportUsecase.updateComplaintReport(req.params.id, updateData, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(createResponse(updated, 'Complaint/Report updated successfully', 200));
    } catch (error) {
      req.log?.error({ error: error.message }, 'ComplaintReportRouter.updateComplaintReport_error');
      if (error.message === 'Complaint/Report not found') {
        return res.status(404).json(createResponse(null, 'Complaint/Report not found', 404));
      }
      if (error.message === 'Notes are required' || 
          error.message === 'Photo evidence is required' ||
          error.message === 'Only status can be updated') {
        return res.status(400).json(createResponse(null, error.message, 400));
      }
      return res.status(500).json(createResponse(null, 'internal server error', 500));
    }
  }

  const getComplaintReportLogsParam = [
    param('id').isInt().notEmpty().withMessage('id must be an integer'),
  ];

  async function getComplaintReportLogs(req, res) {
    try {
      req.log?.info({ id: req.params.id }, 'ComplaintReportRouter.getComplaintReportLogs');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, errors.array()));
      }

      const logs = await complaintReportUsecase.getComplaintReportLogs(req.params.id, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(createResponse(logs, 'success', 200));
    } catch (error) {
      req.log?.error({ error: error.message }, 'ComplaintReportRouter.getComplaintReportLogs_error');
      if (error.message === 'Complaint/Report not found') {
        return res.status(404).json(createResponse(null, 'Complaint/Report not found', 404));
      }
      return res.status(500).json(createResponse(null, 'internal server error', 500));
    }
  }

  const deleteComplaintReportParam = [
    param('id').isInt().notEmpty().withMessage('id must be an integer'),
  ];

  async function deleteComplaintReport(req, res) {
    try {
      req.log?.info({ id: req.params.id }, 'ComplaintReportRouter.deleteComplaintReport');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'validation error', 400, errors.array()));
      }

      await complaintReportUsecase.deleteComplaintReport(req.params.id, {
        userId: req.auth?.userId,
        log: req.log,
      });

      return res.status(200).json(createResponse(null, 'Complaint/Report deleted successfully', 200));
    } catch (error) {
      req.log?.error({ error: error.message }, 'ComplaintReportRouter.deleteComplaintReport_error');
      if (error.message === 'Complaint/Report not found') {
        return res.status(404).json(createResponse(null, 'Complaint/Report not found', 404));
      }
      if (error.message === 'Only the user who created the complaint/report can delete it') {
        return res.status(403).json(createResponse(null, 'Only the user who created the complaint/report can delete it', 403));
      }
      if (error.message === 'Complaint/Report can only be deleted when status is pending or in_progress') {
        return res.status(400).json(createResponse(null, 'Complaint/Report can only be deleted when status is pending or in_progress', 400));
      }
      return res.status(500).json(createResponse(null, 'internal server error', 500));
    }
  }

  router.post('/', createComplaintReportParam, createComplaintReport);
  router.get('/', getAllComplaintReportsParam, getAllComplaintReports);
  router.get('/:id/logs', getComplaintReportLogsParam, getComplaintReportLogs);
  router.get('/:id', getComplaintReportParam, getComplaintReportById);
  router.put('/:id', upload.single('photo_evidence'), compressUploadedImages, updateComplaintReportParam, updateComplaintReport);
  router.delete('/:id', deleteComplaintReportParam, deleteComplaintReport);

  return router;
}

module.exports = { InitComplaintReportRouter };

