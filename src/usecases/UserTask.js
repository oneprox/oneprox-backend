const moment = require("moment-timezone");
const sequelize = require("../models/sequelize");
const { transformEvidenceUrls } = require('../services/baseUrl');
const { nonRoutineDueEndMoment } = require("../utils/nonRoutineDue");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s) {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

/** Build one row per frequency slot (same rules as task detail normalization). */
function buildNonRoutineSlotsForTask(taskJson) {
  const freq = Math.min(5, Math.max(1, Number(taskJson.monthly_frequency) || 1));
  let items = taskJson.non_routine_items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) items = [];

  const mapRow = (it) => {
    if (!it || typeof it !== "object") {
      return { due_date: null, area: null, assigned_user_id: null };
    }
    let due_date = null;
    if (it.due_date != null && it.due_date !== "") {
      const n = Number(it.due_date);
      if (Number.isInteger(n) && n >= 1 && n <= 28) due_date = n;
    }
    const areaRaw = it.area;
    const area =
      areaRaw != null && String(areaRaw).trim() !== "" ? String(areaRaw) : null;
    const uid = it.assigned_user_id;
    return {
      due_date,
      area,
      assigned_user_id:
        uid != null && uid !== "" && isUuid(String(uid))
          ? String(uid).trim()
          : null,
    };
  };

  const taskDue =
    taskJson.due_date != null && taskJson.due_date !== ""
      ? Number(taskJson.due_date)
      : null;
  const taskDueOk =
    taskDue != null && Number.isInteger(taskDue) && taskDue >= 1 && taskDue <= 28
      ? taskDue
      : null;

  const rootUid = taskJson.assigned_user_id;
  let normalized =
    items.length > 0
      ? items.map(mapRow)
      : [
          {
            due_date: taskDueOk,
            area: taskJson.area || null,
            assigned_user_id:
              rootUid != null &&
              rootUid !== "" &&
              isUuid(String(rootUid))
                ? String(rootUid).trim()
                : null,
          },
        ];

  while (normalized.length < freq) {
    normalized.push({ due_date: null, area: null, assigned_user_id: null });
  }
  if (normalized.length > freq) {
    normalized = normalized.slice(0, freq);
  }
  return normalized;
}

function nonRoutineIdempotencyCode(taskId, periodYm, slotIndex) {
  return `NR:${taskId}:${periodYm}:${slotIndex}`;
}

class UserTaskUsecase {
  constructor(userTaskRepository, taskRepository, taskScheduleRepository, userTaskEvidenceRepository) {
    this.userTaskRepository = userTaskRepository;
    this.taskRepository = taskRepository;
    this.taskScheduleRepository = taskScheduleRepository;
    this.userTaskEvidenceRepository = userTaskEvidenceRepository;
  }

  async generateUpcomingUserTasks(ctx) {
    try {
      ctx.log?.info({}, "UserTaskUsecase.generateUpcomingUserTasks");
      
      const result = await this.userTaskRepository.generateUpcomingUserTasks(ctx.userId, 12, ctx);
      return result;
    } catch (error) {
      ctx.log?.error(
        { error: error.message },
        "UserTaskUsecase.generateUpcomingUserTasks_error"
      );
      // Re-throw with custom error for already generated tasks
      if (error.message.includes('already been generated')) {
        const customError = new Error(error.message);
        customError.statusCode = 409; // Conflict
        throw customError;
      }
      throw error;
    }
  }

  async getUserTaskByCode(code, ctx) {
    try {
      ctx.log?.info({ code }, "UserTaskUsecase.getUserTaskByCode");
      const userTask = await this.userTaskRepository.findByCode(code, ctx);
      if (userTask && userTask.evidences) {
        userTask.evidences = transformEvidenceUrls(userTask.evidences);
      }
      return userTask;
    } catch (error) {
      ctx.log?.error(
        { code, error: error.message },
        "UserTaskUsecase.getUserTaskByCode_error"
      );
      throw error;
    }
  }

  async getUserTaskById(userTaskId, ctx) {
    try {
      ctx.log?.info({ userTaskId }, "UserTaskUsecase.getUserTaskById");
      const userTask = await this.userTaskRepository.findById(userTaskId, ctx);
      if (userTask && userTask.evidences) {
        userTask.evidences = transformEvidenceUrls(userTask.evidences);
      }
      return userTask;
    } catch (error) {
      ctx.log?.error(
        { userTaskId, error: error.message },
        "UserTaskUsecase.getUserTaskById_error"
      );
      throw error;
    }
  }

  async getNonRoutineUserTasks(userId, queryParams, ctx) {
    try {
      ctx.log?.info({ userId, queryParams }, "UserTaskUsecase.getNonRoutineUserTasks");
      const result = await this.userTaskRepository.findNonRoutineByUserId(userId, queryParams, ctx);
      const tz = process.env.TASK_DEFAULT_TIMEZONE || "Asia/Jakarta";
      const rows = (result.rows || []).map((task) => {
        if (task.evidences) {
          task.evidences = transformEvidenceUrls(task.evidences);
        }
        return task;
      });
      rows.sort((a, b) => {
        const ma = nonRoutineDueEndMoment(a.notes, tz);
        const mb = nonRoutineDueEndMoment(b.notes, tz);
        const ta = ma ? ma.valueOf() : Number.MAX_SAFE_INTEGER;
        const tb = mb ? mb.valueOf() : Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
      return { ...result, rows };
    } catch (error) {
      ctx.log?.error(
        { userId, queryParams, error: error.message },
        "UserTaskUsecase.getNonRoutineUserTasks_error"
      );
      throw error;
    }
  }

  async getUserTasks(userId, queryParams, ctx) {
    try {
      ctx.log?.info({ userId, queryParams }, "UserTaskUsecase.getUserTasks");
      const result = await this.userTaskRepository.findByUserId(userId, queryParams, ctx);
      if (Array.isArray(result)) {
        return result.map(task => {
          if (task.evidences) {
            task.evidences = transformEvidenceUrls(task.evidences);
          }
          // Transform evidences in sub_user_task array
          if (task.sub_user_task && Array.isArray(task.sub_user_task)) {
            task.sub_user_task = task.sub_user_task.map(subTask => {
              if (subTask.evidences) {
                subTask.evidences = transformEvidenceUrls(subTask.evidences);
              }
              return subTask;
            });
          }
          return task;
        });
      }
      return result;
    } catch (error) {
      ctx.log?.error(
        { userId, queryParams, error: error.message },
        "UserTaskUsecase.getUserTasks_error"
      );
      throw error;
    }
  }

  async getDailyWorkStatus(userId, queryParams, ctx) {
    try {
      ctx.log?.info({ userId, queryParams }, 'UserTaskUsecase.getDailyWorkStatus');
      const result = await this.userTaskRepository.findDailyStatusByUserId(userId, queryParams, ctx);
      const transformTaskArray = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((task) => {
          if (task.evidences) task.evidences = transformEvidenceUrls(task.evidences);
          if (task.sub_user_task && Array.isArray(task.sub_user_task)) {
            task.sub_user_task = task.sub_user_task.map((subTask) => {
              if (subTask.evidences) subTask.evidences = transformEvidenceUrls(subTask.evidences);
              return subTask;
            });
          }
          return task;
        });
      };

      return {
        ...result,
        today_tasks: transformTaskArray(result.today_tasks),
        month_tasks: transformTaskArray(result.month_tasks),
      };
    } catch (error) {
      ctx.log?.error(
        { userId, queryParams, error: error.message },
        'UserTaskUsecase.getDailyWorkStatus_error'
      );
      throw error;
    }
  }

  async getUpcomingUserTasks(userId, ctx) {
    try {
      ctx.log?.info({ userId }, "UserTaskUsecase.getUpcomingUserTasks");
      const userTasks = await this.userTaskRepository.getUpcomingTasks(userId, 12, ctx);
      if (Array.isArray(userTasks)) {
        return userTasks.map(task => {
          if (task.evidences) {
            task.evidences = transformEvidenceUrls(task.evidences);
          }
          return task;
        });
      }
      return userTasks;
    } catch (error) {
      ctx.log?.error(
        { userId, error: error.message },
        "UserTaskUsecase.getUpcomingUserTasks_error"
      );
      throw error;
    }
  }

  async startUserTask(userTaskId, ctx) {
    try {
      ctx.log?.info({ userTaskId }, "UserTaskUsecase.startUserTask");
      
      // Check if user task exists and belongs to the user
      const userTask = await this.userTaskRepository.findById(userTaskId, ctx);
      if (!userTask || userTask.user_id !== ctx.userId) {
        return null;
      }

      if (userTask.start_at !== null) {
        throw new Error('Task has already been started');
      }

      if (userTask.completed_at !== null) {
        throw new Error('Task has already been completed');
      }

      const result = await this.userTaskRepository.startTask(userTaskId, ctx);
      // Transform evidence URLs in the result
      if (result && result.evidences) {
        result.evidences = transformEvidenceUrls(result.evidences);
      }
      return result;
    } catch (error) {
      ctx.log?.error(
        { userTaskId, error: error.message },
        "UserTaskUsecase.startUserTask_error"
      );
      throw error;
    }
  }

  async completeUserTask(userTaskId, data, ctx) {
    try {
      ctx.log?.info({ userTaskId, data }, "UserTaskUsecase.completeUserTask");
      
      // Use transaction to ensure atomicity
      const result = await sequelize.transaction(async (tx) => {
        // Check if user task exists and belongs to the user
        const userTask = await this.userTaskRepository.findById(userTaskId, ctx);
        if (!userTask || userTask.user_id !== ctx.userId) {
          return null;
        }

        if (userTask.start_at === null) {
          throw new Error('Task must be started before it can be completed');
        }

        if (userTask.completed_at !== null) {
          throw new Error('Task has already been completed');
        }

        // Get task details to check if validation or scan is needed
        const task = await this.taskRepository.findById(userTask.task_id, ctx);
        
        // Complete the task
        const completedTask = await this.userTaskRepository.completeTask(userTaskId, data.notes, ctx, tx);

        // Handle evidence files - save all evidences provided
        const evidencesToSave = [];
        
        // Add file evidences if provided
        if (data.evidences && data.evidences.length > 0) {
          evidencesToSave.push(...data.evidences);
        }

        // Save all evidences
        if (evidencesToSave.length > 0) {
          for (const evidence of evidencesToSave) {
            // Use url field from evidence data
            if (evidence.url) {
              await this.userTaskEvidenceRepository.create({
                user_task_id: userTaskId,
                url: evidence.url,
                type: evidence.type || 'after',
              }, ctx, tx);
            }
          }
        }

        return completedTask;
      });
      
      // Transform evidence URLs in the result
      if (result && result.evidences) {
        result.evidences = transformEvidenceUrls(result.evidences);
      }
      
      return result;
    } catch (error) {
      ctx.log?.error(
        { userTaskId, data, error: error.message, errorStack: error.stack },
        "UserTaskUsecase.completeUserTask_error"
      );
      throw error;
    }
  }

  /**
   * Buat user_tasks untuk semua task non-rutin pada bulan kalender tertentu.
   * Satu baris per slot frekuensi × user ter-assign; user yang sama bisa beberapa kali jika beberapa slot menunjuk ke mereka.
   * Idempoten per (task_id, bulan, index slot) lewat field `code`.
   *
   * @param {{ year?: number, month?: number, dryRun?: boolean, timezone?: string }} options
   * @param {{ log?: object }} ctx
   */
  async generateNonRoutineUserTasksForMonth(options = {}, ctx = {}) {
    const timezone =
      options.timezone || process.env.TASK_DEFAULT_TIMEZONE || "Asia/Jakarta";
    const dryRun = Boolean(options.dryRun);
    const now = moment.tz(timezone);
    const year =
      options.year !== undefined && options.year !== null
        ? Number(options.year)
        : now.year();
    const month =
      options.month !== undefined && options.month !== null
        ? Number(options.month)
        : now.month() + 1;

    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      throw new Error("Invalid year or month");
    }

    const periodYm = `${year}-${String(month).padStart(2, "0")}`;
    const daysInMonth = moment.tz({ year, month: month - 1 }, timezone).daysInMonth();

    ctx.log?.info(
      { year, month, periodYm, dryRun, timezone },
      "UserTaskUsecase.generateNonRoutineUserTasksForMonth"
    );

    const summary = {
      period: periodYm,
      timezone,
      dryRun,
      tasksScanned: 0,
      slotsTotal: 0,
      created: 0,
      skippedExisting: 0,
      skippedNoAssignee: 0,
      skippedInvalidDue: 0,
      createdIds: [],
      details: [],
    };

    await sequelize.transaction(async (tx) => {
      const tasks = await this.taskRepository.findAllNonRoutineBare(ctx, tx);
      summary.tasksScanned = tasks.length;

      for (const taskJson of tasks) {
        const slots = buildNonRoutineSlotsForTask(taskJson);
        summary.slotsTotal += slots.length;

        for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
          const slot = slots[slotIndex];
          const userId = slot.assigned_user_id;
          if (!userId) {
            summary.skippedNoAssignee += 1;
            summary.details.push({
              taskId: taskJson.id,
              slotIndex,
              action: "skip_no_assignee",
            });
            continue;
          }

          let dueDay = slot.due_date;
          if (dueDay == null || !Number.isInteger(dueDay)) {
            summary.skippedInvalidDue += 1;
            summary.details.push({
              taskId: taskJson.id,
              slotIndex,
              action: "skip_invalid_due_date",
            });
            continue;
          }
          dueDay = Math.min(dueDay, daysInMonth);

          const code = nonRoutineIdempotencyCode(taskJson.id, periodYm, slotIndex);

          const existing = await this.userTaskRepository.findOneByCode(code, ctx, tx);
          if (existing) {
            summary.skippedExisting += 1;
            summary.details.push({
              taskId: taskJson.id,
              slotIndex,
              userId,
              action: "skip_exists",
              userTaskId: existing.id,
            });
            continue;
          }

          const notesObj = {
            non_routine: true,
            period: periodYm,
            slot: slotIndex,
            due_day: dueDay,
            area: slot.area || null,
            task_name: taskJson.name,
          };

          if (dryRun) {
            summary.created += 1;
            summary.details.push({
              taskId: taskJson.id,
              slotIndex,
              userId,
              action: "would_create",
              start_at: null,
              jatuh_tempo: `${periodYm}-${String(dueDay).padStart(2, "0")}`,
              code,
            });
            continue;
          }

          const created = await this.userTaskRepository.create(
            {
              task_id: taskJson.id,
              user_id: userId,
              start_at: null,
              completed_at: null,
              notes: JSON.stringify(notesObj),
              status: "pending",
              code,
              is_main_task: taskJson.is_main_task !== false,
              parent_user_task_id: null,
              time: null,
              is_routine: false,
            },
            ctx,
            tx
          );

          summary.created += 1;
          if (created && created.id) summary.createdIds.push(created.id);
          summary.details.push({
            taskId: taskJson.id,
            slotIndex,
            userId,
            action: "created",
            userTaskId: created.id,
            code,
          });
        }
      }
    });

    return summary;
  }
}

module.exports = UserTaskUsecase;
