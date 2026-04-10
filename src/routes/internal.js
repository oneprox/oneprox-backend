const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { basicAuthFromEnv } = require('../middleware/basicAuth');
const { createResponse } = require('../services/response');
const { sendTenantPaymentDueSoonEmail } = require('../services/Mailer');
const fs = require('fs');
const path = require('path');

function daysLeftFromDeadline(deadline, now = new Date()) {
  const dl = deadline ? new Date(deadline) : null;
  if (!dl || Number.isNaN(dl.getTime())) return null;
  const ms = dl.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Calculate payment status based on payment deadline and payment term
 * @param {Date|string|null} deadline - Payment deadline date
 * @param {Date} now - Current date (default: new Date())
 * @param {number} paymentTerm - Payment term: 0=year, 1=month
 * @returns {'paid' | 'scheduled' | 'reminder_needed' | 'overdue'}
 */
function calculatePaymentStatus(deadline, now = new Date(), paymentTerm = 1) {
  if (!deadline) return 'scheduled';
  
  const dl = deadline ? new Date(deadline) : null;
  if (!dl || Number.isNaN(dl.getTime())) return 'scheduled';
  
  const left = daysLeftFromDeadline(dl, now);
  if (left === null) return 'scheduled';
  
  // If deadline has passed, status is overdue
  if (left < 0) {
    return 'overdue';
  }
  
  // Determine reminder days based on payment term
  // payment_term: 0 = year, 1 = month
  let reminderDays = 7; // Default for monthly
  if (paymentTerm === 0) {
    // For yearly payment: H-3 bulan (90 days) sampai H
    reminderDays = 90;
  } else if (paymentTerm === 1) {
    // For monthly payment: H-7 sampai H
    reminderDays = 7;
  }
  
  // If within reminder period (H-reminderDays sampai H)
  if (left <= reminderDays) {
    return 'reminder_needed';
  }
  
  return 'scheduled';
}

/**
 * Update tenant payment_status based on payment logs
 * @param {Object} params
 * @param {Object} params.tenantRepository - Tenant repository instance
 * @param {Object} params.tenantPaymentLogRepository - Tenant payment log repository instance
 * @param {string} params.tenantId - Tenant ID to update
 * @param {Object} params.ctx - Context object with log
 * @returns {Promise<'paid' | 'scheduled' | 'reminder_needed' | 'overdue'>} - Updated payment status
 */
async function updateTenantPaymentStatus({ tenantRepository, tenantPaymentLogRepository, tenantId, ctx = {} }) {
  try {
    ctx.log?.info({ tenantId }, 'updateTenantPaymentStatus: Starting');
    
    // Get current tenant to see payment_term
    const currentTenant = await tenantRepository.findById(tenantId, ctx);
    if (!currentTenant) {
      ctx.log?.warn({ tenantId }, 'updateTenantPaymentStatus: Tenant not found');
      return 'scheduled';
    }
    
    const paymentTerm = currentTenant.payment_term !== undefined && currentTenant.payment_term !== null 
      ? currentTenant.payment_term 
      : 1; // Default to monthly (1) if not set
    
    ctx.log?.info({ 
      tenantId, 
      currentPaymentStatus: currentTenant?.payment_status,
      paymentTerm 
    }, 'updateTenantPaymentStatus: Current tenant status');
    
    // Get all payment logs for this tenant (unpaid and paid)
    const allLogs = await tenantPaymentLogRepository.findByTenantId(
      tenantId,
      { limit: 1000 },
      ctx
    );
    
    const now = new Date();
    const paymentLogs = allLogs.rows || [];
    
    ctx.log?.info({ 
      tenantId, 
      totalLogs: paymentLogs.length,
      paymentTerm
    }, 'updateTenantPaymentStatus: Payment logs summary');
    
    // Find the nearest deadline from all payment logs (paid and unpaid)
    let nearestDeadline = null;
    let nearestDeadlineLog = null;
    
    for (const log of paymentLogs) {
      if (log.payment_deadline) {
        const deadline = new Date(log.payment_deadline);
        // Find the deadline that is closest to today (can be past or future)
        if (!nearestDeadline) {
          nearestDeadline = deadline;
          nearestDeadlineLog = log;
        } else {
          // Compare absolute distance from today
          const currentDistance = Math.abs(deadline.getTime() - now.getTime());
          const nearestDistance = Math.abs(nearestDeadline.getTime() - now.getTime());
          if (currentDistance < nearestDistance) {
            nearestDeadline = deadline;
            nearestDeadlineLog = log;
          }
        }
      }
    }
    
    // If no payment logs with deadline, default to scheduled
    if (!nearestDeadline || !nearestDeadlineLog) {
      await tenantRepository.update(tenantId, { payment_status: 'scheduled' });
      ctx.log?.info({ tenantId }, 'updateTenantPaymentStatus: Updated to scheduled (no deadline found)');
      return 'scheduled';
    }
    
    // Check if the nearest deadline payment is paid or unpaid
    const isPaid = nearestDeadlineLog.status === 1 || nearestDeadlineLog.status === 'paid' || nearestDeadlineLog.status === '1';
    const daysSinceDeadline = daysLeftFromDeadline(nearestDeadline, now);
    
    ctx.log?.info({ 
      tenantId,
      nearestDeadline: nearestDeadline.toISOString(),
      isPaid,
      daysSinceDeadline,
      paymentTerm
    }, 'updateTenantPaymentStatus: Nearest deadline info');
    
    // If the nearest deadline payment is paid
    if (isPaid) {
      // Check if deadline passed more than 7 days ago
      if (daysSinceDeadline !== null && daysSinceDeadline < -7) {
        // Deadline passed more than 7 days ago → scheduled
        await tenantRepository.update(tenantId, { payment_status: 'scheduled' });
        ctx.log?.info({ 
          tenantId, 
          daysSinceDeadline,
          nearestDeadline: nearestDeadline.toISOString(),
          reason: 'Nearest deadline payment is paid and deadline passed more than 7 days ago'
        }, 'updateTenantPaymentStatus: Updated to scheduled');
        return 'scheduled';
      } else {
        // Deadline not passed or passed less than 7 days → paid
        await tenantRepository.update(tenantId, { payment_status: 'paid' });
        ctx.log?.info({ 
          tenantId, 
          daysSinceDeadline,
          nearestDeadline: nearestDeadline.toISOString(),
          reason: 'Nearest deadline payment is paid and deadline not passed more than 7 days'
        }, 'updateTenantPaymentStatus: Updated to paid');
        return 'paid';
      }
    }
    
    // If the nearest deadline payment is unpaid, calculate status based on deadline and payment_term
    const status = calculatePaymentStatus(nearestDeadline, now, paymentTerm);
    await tenantRepository.update(tenantId, { payment_status: status });
    ctx.log?.info({ 
      tenantId, 
      status, 
      paymentTerm,
      nearestDeadline: nearestDeadline.toISOString(),
      daysLeft: daysSinceDeadline,
      reason: 'Nearest deadline payment is unpaid, calculating status based on deadline'
    }, 'updateTenantPaymentStatus: Updated based on unpaid deadline');
    return status;
  } catch (err) {
    ctx.log?.error({ tenantId, error: err.message, stack: err.stack }, 'updateTenantPaymentStatus: Error');
    throw err;
  }
}

function InitInternalRouter({
  tenantRepository,
  tenantPaymentLogRepository,
  userTaskEvidenceRepository,
  userTaskUsecase,
}) {
  const router = Router();

  // Protect everything under /api/internal with basic auth
  router.use(basicAuthFromEnv({ realm: 'Oripro Internal' }));

  /**
   * GET /api/internal/tenant-payments/due-soon?days=7&dryRun=true
   *
   * Scans unpaid tenant payment logs with payment_deadline within N days
   * and sends SMTP reminders to the tenant user email (if present).
   */
  router.get(
    '/tenant-payments/due-soon',
    [
      query('days').optional().isInt({ min: 0, max: 365 }).withMessage('days must be an integer between 0 and 365'),
      query('dryRun').optional().isBoolean().withMessage('dryRun must be boolean'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'bad request', 400, false, {}, errors));
      }

      const days = req.query.days != null ? Number(req.query.days) : 7;
      const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
      const now = new Date();

      try {
        // Fetch all unpaid logs (we'll filter by payment_term reminder window)
        // Use a large window (365 days) to get all unpaid logs, then filter by payment_term
        const allUnpaidLogs = await tenantPaymentLogRepository.findUnpaidDueSoon({ days: 365, now }, { log: req.log });
        
        // Filter logs based on payment_term reminder window
        const paymentLogs = [];
        for (const pl of allUnpaidLogs) {
          const tenant = pl.tenant || null;
          const paymentTerm = tenant?.payment_term !== undefined && tenant?.payment_term !== null 
            ? tenant.payment_term 
            : 1; // Default to monthly
          
          const dl = pl.payment_deadline ? new Date(pl.payment_deadline) : null;
          if (!dl || Number.isNaN(dl.getTime())) continue;
          
          // Calculate days until deadline
          const daysUntilDeadline = Math.ceil((dl.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          
          // Check if reminder should be sent based on payment_term
          let shouldRemind = false;
          if (paymentTerm === 0) {
            // Yearly: send reminder if deadline is within 3 months (90 days) or less
            // We want to send it when we're at or past the 3-month mark before deadline
            const threeMonthsInDays = 90;
            shouldRemind = daysUntilDeadline <= threeMonthsInDays && daysUntilDeadline >= 0;
          } else {
            // Monthly: send reminder if deadline is within 7 days or less
            shouldRemind = daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
          }
          
          if (shouldRemind) {
            paymentLogs.push(pl);
          }
        }
        
        let emailed = 0;
        let skippedNoEmail = 0;
        let updatedTenants = 0;
        const tenantStatusMap = new Map(); // Track payment status per tenant

        const items = [];
        for (const pl of paymentLogs) {
          const tenant = pl.tenant || null;
          const userEmail = tenant?.user?.email || null;
          const dl = pl.payment_deadline || null;
          const left = daysLeftFromDeadline(dl, now);
          
          // Get payment_term from tenant (0=year, 1=month)
          const paymentTerm = tenant?.payment_term !== undefined && tenant?.payment_term !== null 
            ? tenant.payment_term 
            : 1; // Default to monthly
          
          // Determine payment status for this tenant based on deadline and payment_term
          let paymentStatus = 'scheduled';
          if (left !== null) {
            paymentStatus = calculatePaymentStatus(dl, now, paymentTerm);
          }
          
          // Track the most critical status for each tenant
          if (tenant?.id) {
            const currentStatus = tenantStatusMap.get(tenant.id);
            if (!currentStatus || 
                (paymentStatus === 'overdue' && currentStatus !== 'overdue') ||
                (paymentStatus === 'reminder_needed' && currentStatus === 'scheduled')) {
              tenantStatusMap.set(tenant.id, paymentStatus);
            }
          }

          const item = {
            paymentLogId: pl.id,
            tenantId: tenant?.id || pl.tenant_id,
            tenantName: tenant?.name || null,
            tenantCode: tenant?.code || null,
            email: userEmail,
            deadline: dl,
            daysLeft: left,
            amount: pl.amount,
            paymentStatus,
          };
          items.push(item);

          if (!userEmail) {
            skippedNoEmail += 1;
            continue;
          }

          if (!dryRun) {
            await sendTenantPaymentDueSoonEmail({
              to: userEmail,
              tenantName: tenant?.name,
              tenantCode: tenant?.code,
              paymentId: pl.id,
              amount: pl.amount,
              deadline: dl,
              daysLeft: left,
            });
            await tenantPaymentLogRepository.update(
              pl.id,
              { reminder_sent_at: new Date() },
              { log: req.log }
            );
            emailed += 1;
          }
        }
        // Update payment_status for all tenants that have unpaid payment logs
        // This is done outside the findUnpaidDueSoon loop to ensure all tenants are updated
        if (!dryRun) {
          try {
            // Get all unique tenant IDs that have unpaid payment logs
            const allTenantIdsWithUnpaid = await tenantPaymentLogRepository.findTenantIdsWithUnpaidLogs({ log: req.log });
            
            req.log?.info({ 
              totalTenantsWithUnpaid: allTenantIdsWithUnpaid?.length || 0
            }, 'Found tenants with unpaid payment logs');
            
            // Update payment_status for each tenant that has unpaid payment logs
            if (allTenantIdsWithUnpaid && Array.isArray(allTenantIdsWithUnpaid)) {
              for (const tenantId of allTenantIdsWithUnpaid) {
                try {
                  const newStatus = await updateTenantPaymentStatus({
                    tenantRepository,
                    tenantPaymentLogRepository,
                    tenantId,
                    ctx: { log: req.log }
                  });
                  updatedTenants += 1;
                  req.log?.info({ tenantId, newStatus }, 'Updated tenant payment_status from due-soon endpoint');
                } catch (err) {
                  req.log?.error({ tenantId, err: err.message, stack: err.stack }, 'Failed to update tenant payment_status');
                }
              }
            }
          } catch (err) {
            req.log?.error({ err: err.message, stack: err.stack }, 'Failed to find tenants with unpaid logs');
            // Don't throw, just log the error and continue
          }
        }

        // Also expose tenants count for sanity-checking
        const tenantsResult = await tenantRepository.findAll({}, { log: req.log });

        return res.status(200).json(
          createResponse(
            {
              dryRun,
              days,
              now: now.toISOString(),
              tenantsTotal: tenantsResult?.total ?? null,
              dueSoonCount: paymentLogs.length,
              emailed,
              skippedNoEmail,
              updatedTenants,
              items,
            },
            'success',
            200
          )
        );
      } catch (err) {
        req.log?.error({ 
          err: err.message, 
          stack: err.stack,
          name: err.name 
        }, 'InternalRouter.tenant-payments.due-soon_error');
        return res.status(500).json(createResponse(null, 'internal server error', 500, false, {}, {
          message: err.message,
          name: err.name
        }));
      }
    }
  );

  /**
   * DELETE /api/internal/user-task-evidence/old?months=6&dryRun=true
   *
   * Deletes physical image files from user_task_evidences that are older than X months.
   * Database records are kept intact.
   */
  router.delete(
    '/user-task-evidence/old',
    [
      query('months').isInt({ min: 1, max: 120 }).withMessage('months must be an integer between 1 and 120'),
      query('dryRun').optional().isBoolean().withMessage('dryRun must be boolean'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'bad request', 400, false, {}, errors));
      }

      const months = Number(req.query.months);
      const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';

      try {
        req.log?.info({ months, dryRun }, 'InternalRouter.user-task-evidence.old: Starting');

        // Find all evidence records older than X months
        const oldEvidences = await userTaskEvidenceRepository.findOlderThan(months, { log: req.log });

        req.log?.info({ count: oldEvidences.length }, 'InternalRouter.user-task-evidence.old: Found old evidence records');

        let deletedFiles = 0;
        let skippedFiles = 0;
        let fileErrors = 0;
        const deletedItems = [];
        const deletionErrors = [];

        for (const evidence of oldEvidences) {
          const url = evidence.url;
          
          // Skip text-based evidence (format: "text:...")
          if (url && url.startsWith('text:')) {
            skippedFiles += 1;
            continue;
          }

          // Extract filename from URL
          // URLs can be in format: http://host/uploads/user-task-evidence/filename
          // or: /uploads/user-task-evidence/filename
          let filename = null;
          if (url) {
            const match = url.match(/\/user-task-evidence\/([^\/\?]+)/);
            if (match && match[1]) {
              filename = match[1];
            }
          }

          if (!filename) {
            req.log?.warn({ evidenceId: evidence.id, url }, 'InternalRouter.user-task-evidence.old: Could not extract filename from URL');
            skippedFiles += 1;
            continue;
          }

          const filePath = path.join(process.cwd(), 'public', 'uploads', 'user-task-evidence', filename);

          const item = {
            evidenceId: evidence.id,
            userTaskId: evidence.user_task_id,
            url: evidence.url,
            filename: filename,
            createdAt: evidence.created_at,
            fileExists: false,
            fileDeleted: false,
          };

          // Check if file exists and delete it
          if (fs.existsSync(filePath)) {
            item.fileExists = true;
            if (!dryRun) {
              try {
                fs.unlinkSync(filePath);
                item.fileDeleted = true;
                deletedFiles += 1;
                req.log?.info({ filePath, evidenceId: evidence.id }, 'InternalRouter.user-task-evidence.old: Deleted file');
              } catch (err) {
                fileErrors += 1;
                item.fileError = err.message;
                deletionErrors.push({ evidenceId: evidence.id, filePath, error: err.message });
                req.log?.error({ filePath, evidenceId: evidence.id, error: err.message }, 'InternalRouter.user-task-evidence.old: Failed to delete file');
              }
            }
          } else {
            req.log?.warn({ filePath, evidenceId: evidence.id }, 'InternalRouter.user-task-evidence.old: File does not exist');
          }

          deletedItems.push(item);
        }

        return res.status(200).json(
          createResponse(
            {
              dryRun,
              months,
              totalFound: oldEvidences.length,
              deletedFiles,
              skippedFiles,
              fileErrors,
              errors: deletionErrors.length > 0 ? deletionErrors : undefined,
              items: deletedItems,
            },
            'success',
            200
          )
        );
      } catch (err) {
        req.log?.error({ 
          err: err.message, 
          stack: err.stack,
          name: err.name 
        }, 'InternalRouter.user-task-evidence.old_error');
        return res.status(500).json(createResponse(null, 'internal server error', 500, false, {}, {
          message: err.message,
          name: err.name
        }));
      }
    }
  );

  /**
   * POST /api/internal/user-tasks/generate-non-routine-monthly?year=2026&month=4&dryRun=true&include_details=false
   *
   * Generates one user_task per non-routine task frequency slot for the calendar month.
   * Idempotent via user_tasks.code = NR:{taskId}:{YYYY-MM}:{slotIndex}.
   * Intended for monthly cron (Basic Auth).
   */
  router.post(
    '/user-tasks/generate-non-routine-monthly',
    [
      query('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('year must be 2000–2100'),
      query('month').optional().isInt({ min: 1, max: 12 }).withMessage('month must be 1–12'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(createResponse(null, 'bad request', 400, false, {}, errors));
      }

      const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
      const includeDetails =
        String(req.query.include_details || 'true').toLowerCase() !== 'false';

      const year = req.query.year != null ? Number(req.query.year) : undefined;
      const month = req.query.month != null ? Number(req.query.month) : undefined;

      try {
        req.log?.info({ year, month, dryRun }, 'InternalRouter.generate-non-routine-monthly: start');

        const result = await userTaskUsecase.generateNonRoutineUserTasksForMonth(
          { year, month, dryRun },
          { log: req.log }
        );

        if (!includeDetails) {
          delete result.details;
        }

        return res.status(200).json(createResponse(result, 'success', 200));
      } catch (err) {
        req.log?.error(
          { err: err.message, stack: err.stack },
          'InternalRouter.generate-non-routine-monthly_error'
        );
        return res.status(500).json(
          createResponse(null, 'internal server error', 500, false, {}, {
            message: err.message,
            name: err.name,
          })
        );
      }
    }
  );

  return router;
}

module.exports = { 
  InitInternalRouter,
  updateTenantPaymentStatus,
  calculatePaymentStatus,
  daysLeftFromDeadline
};


