const { Op } = require("sequelize");
const moment = require("moment-timezone");
const { UserTaskStatusIntToStr, UserTaskStatusStrToInt } = require("../models/UserTask");

class UserTaskRepository {
  constructor(userTaskModel, userModel, taskModel, userTaskEvidenceModel, taskScheduleModel, taskGroupModel, taskParentModel) {
    this.userTaskModel = userTaskModel;
    this.userModel = userModel;
    this.taskModel = taskModel;
    this.userTaskEvidenceModel = userTaskEvidenceModel;
    this.taskScheduleModel = taskScheduleModel;
    this.taskGroupModel = taskGroupModel;
    this.taskParentModel = taskParentModel;
  }

  async create(data, ctx = {}, tx = null) {
    try {
      ctx.log?.info(data, 'UserTaskRepository.create');
      
      // Convert status from string to integer if provided
      let statusInt = 0; // default to pending
      if (data.status !== undefined) {
        if (typeof data.status === 'string') {
          statusInt = UserTaskStatusStrToInt[data.status] !== undefined 
            ? UserTaskStatusStrToInt[data.status] 
            : 0;
        } else if (typeof data.status === 'number') {
          statusInt = data.status;
        }
      }
      
      const userTask = await this.userTaskModel.create({
        task_id: data.task_id,
        user_id: data.user_id,
        start_at: data.start_at,
        completed_at: data.completed_at,
        notes: data.notes,
        status: statusInt,
        code: data.code || null,
        is_main_task: data.is_main_task !== undefined ? data.is_main_task : false,
        parent_user_task_id: data.parent_user_task_id || null,
        time: data.time || null,
        is_routine: data.is_routine !== undefined ? Boolean(data.is_routine) : true,
      }, { transaction: tx });
      return userTask.toJSON();
    } catch (error) {
      ctx.log?.error({ data, error }, 'UserTaskRepository.create_error');
      throw error;
    }
  }

  async findById(id, ctx = {}) {
    try {
      ctx.log?.info({ id }, 'UserTaskRepository.findById');
      const userTask = await this.userTaskModel.findByPk(id, {
        include: [
          {
            model: this.userModel,
            as: 'user',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.taskModel,
            as: 'task',
            attributes: ['id', 'name', 'duration', 'is_scan', 'scan_code']
          },
          {
            model: this.userTaskEvidenceModel,
            as: 'evidences',
            attributes: ['id', 'user_task_id', 'url', 'created_at']
          }
        ]
      });
      if (!userTask) return null;
      const userTaskJson = userTask.toJSON();
      // Convert status from integer to string for response
      if (userTaskJson.status !== undefined) {
        userTaskJson.status = UserTaskStatusIntToStr[userTaskJson.status] || 'pending';
      }
      return userTaskJson;
    } catch (error) {
      ctx.log?.error({ code, error }, 'UserTaskRepository.findByCode_error');
      throw error;
    }
  }

  async findByCode(code, ctx = {}) {
    try {
      ctx.log?.info({ code }, 'UserTaskRepository.findByCode');
      const userTask = await this.userTaskModel.findOne({
        where: { code },
        include: [
          {
            model: this.userModel,
            as: 'user',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.taskModel,
            as: 'task',
            attributes: ['id', 'name', 'duration', 'is_scan', 'scan_code']
          },
          {
            model: this.userTaskEvidenceModel,
            as: 'evidences',
            attributes: ['id', 'user_task_id', 'url', 'created_at']
          }
        ]
      });
      if (!userTask) return null;
      const userTaskJson = userTask.toJSON();
      // Convert status from integer to string for response
      if (userTaskJson.status !== undefined) {
        userTaskJson.status = UserTaskStatusIntToStr[userTaskJson.status] || 'pending';
      }
      return userTaskJson;
    } catch (error) {
      ctx.log?.error({ code, error }, 'UserTaskRepository.findByCode_error');
      throw error;
    }
  }

  async findAll(filters = {}, ctx = {}) {
    try {
      ctx.log?.info({ filters }, 'UserTaskRepository.findAll');
      const queryOptions = {
        include: [
          {
            model: this.userModel,
            as: 'user',
            attributes: ['id', 'name', 'email'],
            include: [
              {
                model: require('../models/Role'),
                as: 'role',
                attributes: ['id', 'name', 'level'],
                required: false
              }
            ]
          },
          {
            model: this.taskModel,
            as: 'task',
            attributes: ['id', 'name', 'duration', 'is_scan', 'scan_code'],
            required: false,
            include: [
              {
                model: require('../models/Role'),
                as: 'role',
                attributes: ['id', 'name', 'level'],
                required: false
              }
            ]
          },
          {
            model: this.userTaskEvidenceModel,
            as: 'evidences',
            attributes: ['id', 'user_task_id', 'url', 'created_at']
          }
        ],
        order: [['created_at', 'DESC']]
      };

      if (filters.limit) {
        queryOptions.limit = parseInt(filters.limit);
      }
      if (filters.offset) {
        queryOptions.offset = parseInt(filters.offset);
      }

      const { count, rows } = await this.userTaskModel.findAndCountAll(queryOptions);

      return {
        rows: rows.map(ut => {
          const utJson = ut.toJSON();
          // Convert status from integer to string
          if (utJson.status !== undefined) {
            utJson.status = UserTaskStatusIntToStr[utJson.status] || 'pending';
          }
          return utJson;
        }),
        total: count
      };
    } catch (error) {
      ctx.log?.error({ filters, error: error.message }, 'UserTaskRepository.findAll_error');
      throw error;
    }
  }

  async findByUserId(userId, queryParams = {}, ctx = {}) {
    try {
      ctx.log?.info({ userId, queryParams }, 'UserTaskRepository.findByUserId');
      const { limit = 10, offset = 0, date_from = null, date_to = null } = queryParams;
      const { Op } = require('sequelize');
      
      // Build date filter if provided
      let dateFilter = {};
      if (date_from || date_to) {
        dateFilter.created_at = {};
        if (date_from) {
          // Start of the day for date_from
          const fromDate = new Date(date_from);
          fromDate.setHours(0, 0, 0, 0);
          dateFilter.created_at[Op.gte] = fromDate;
        }
        if (date_to) {
          // End of the day for date_to
          const toDate = new Date(date_to);
          toDate.setHours(23, 59, 59, 999);
          dateFilter.created_at[Op.lte] = toDate;
        }
      }
      
      // Step 1: Hanya task rutin — hindari code NR:* jadi "latest" dan merusak batch shift
      const codeWhereClause = { user_id: userId, is_routine: true, ...dateFilter };
      const allUserTasksForCode = await this.userTaskModel.findAll({
        where: codeWhereClause,
        order: [['created_at', 'DESC']],
        limit: 1, // Just need the first one to get the code
        attributes: ['code', 'created_at']
      });

      // Step 2: Get the latest code from the newest user task
      let latestCode = null;
      if (allUserTasksForCode.length > 0) {
        const newestTask = allUserTasksForCode[0].toJSON();
        latestCode = newestTask.code;
      }

      ctx.log?.info({ 
        userId, 
        latestCode,
        hasCode: !!latestCode,
        date_from,
        date_to
      }, 'UserTaskRepository.findByUserId - Found latest code');

      // Step 3: Get all user tasks filtered by the latest code (if found) and date range
      const whereClause = latestCode 
        ? { user_id: userId, code: latestCode, ...dateFilter }
        : { user_id: userId, ...dateFilter };

      const { rows, count } = await this.userTaskModel.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit) * 10, // Increase limit to account for child tasks
        offset: parseInt(offset),
        order: [['id', 'ASC']],
        include: [
          {
            model: this.taskModel,
            as: 'task',
            required: false // Don't require task - some user_tasks might not have matching tasks
          },
          {
            model: this.userTaskEvidenceModel,
            as: 'evidences',
            attributes: ['id', 'user_task_id', 'url', 'created_at']
          }
        ]
      });

      ctx.log?.info({ 
        userId, 
        latestCode,
        rowsCount: rows.length, 
        totalCount: count,
        limit: parseInt(limit) * 10,
        offset: parseInt(offset)
      }, 'UserTaskRepository.findByUserId - User tasks with latest code');

      // Step 4: Process user tasks to group child tasks under main tasks
      const userTasksJson = rows.map(ut => {
        const utJson = ut.toJSON();
        // Convert status from integer to string for response
        if (utJson.status !== undefined) {
          utJson.status = UserTaskStatusIntToStr[utJson.status] || 'pending';
        }
        return utJson;
      });

      // Step 5: Separate main tasks and child tasks
      const mainTasks = [];
      const childTasksMap = new Map(); // Map parent_user_task_id -> array of child user tasks
      const userTaskIdMap = new Map(); // Map user_task_id -> user_task for quick lookup

      // First pass: create maps and separate main/child tasks
      userTasksJson.forEach(userTask => {
        userTaskIdMap.set(userTask.id, userTask);
        
        if (userTask.is_main_task) {
          // This is a main task
          userTask.childTasks = [];
          mainTasks.push(userTask);
        } else if (userTask.parent_user_task_id) {
          // This is a child task - add it to childTasksMap
          const parentId = userTask.parent_user_task_id;
          if (!childTasksMap.has(parentId)) {
            childTasksMap.set(parentId, []);
          }
          childTasksMap.get(parentId).push(userTask);
        } else {
          // Task without parent or main flag, treat as standalone (main task)
          userTask.childTasks = [];
          userTask.is_main_task = true; // Ensure it's marked as main
          mainTasks.push(userTask);
        }
      });

      // Second pass: attach child tasks to their parent user tasks
      childTasksMap.forEach((childUserTasks, parentUserTaskId) => {
        const parentUserTask = userTaskIdMap.get(parentUserTaskId);
        if (parentUserTask) {
          if (!parentUserTask.childTasks) {
            parentUserTask.childTasks = [];
          }
          // Add children, avoiding duplicates
          const existingIds = new Set(parentUserTask.childTasks.map(ct => ct.id));
          childUserTasks.forEach(childUt => {
            if (!existingIds.has(childUt.id)) {
              parentUserTask.childTasks.push(childUt);
            }
          });
        } else {
          // Log warning if parent not found
          ctx.log?.warn({ 
            parentUserTaskId, 
            childTaskIds: childUserTasks.map(ct => ct.id),
            availableParentIds: Array.from(userTaskIdMap.keys())
          }, 'Parent user task not found for child tasks');
        }
      });
      
      // Ensure all main tasks have childTasks array (even if empty)
      mainTasks.forEach(mainTask => {
        if (!mainTask.childTasks) {
          mainTask.childTasks = [];
        }
        
        // Double-check: if this main task has children in childTasksMap, ensure they're attached
        if (childTasksMap.has(mainTask.id)) {
          const childrenFromMap = childTasksMap.get(mainTask.id);
          const existingIds = new Set(mainTask.childTasks.map(ct => ct.id));
          childrenFromMap.forEach(childUt => {
            if (!existingIds.has(childUt.id)) {
              mainTask.childTasks.push(childUt);
            }
          });
        }
      });

      // Step 6: Build result array format: flat user task objects with sub_user_task array
      const result = mainTasks.map(mainTask => {
        const childTasks = mainTask.childTasks || [];
        
        // Create a flat object with all main task properties
        const userTaskObj = {
          user_task_id: mainTask.id,
          task_id: mainTask.task_id,
          user_id: mainTask.user_id,
          start_at: mainTask.start_at,
          completed_at: mainTask.completed_at,
          notes: mainTask.notes,
          status: mainTask.status,
          code: mainTask.code,
          is_main_task: mainTask.is_main_task,
          parent_user_task_id: mainTask.parent_user_task_id,
          time: mainTask.time,
          created_at: mainTask.created_at,
          updated_at: mainTask.updated_at,
          task: mainTask.task,
          evidences: mainTask.evidences || [],
          sub_user_task: childTasks.map(childTask => ({
            user_task_id: childTask.id,
            task_id: childTask.task_id,
            user_id: childTask.user_id,
            start_at: childTask.start_at,
            completed_at: childTask.completed_at,
            notes: childTask.notes,
            status: childTask.status,
            code: childTask.code,
            is_main_task: childTask.is_main_task,
            parent_user_task_id: childTask.parent_user_task_id,
            time: childTask.time,
            created_at: childTask.created_at,
            updated_at: childTask.updated_at,
            task: childTask.task,
            evidences: childTask.evidences || [],
            sub_user_task: [] // Child tasks don't have sub-tasks
          }))
        };
        
        return userTaskObj;
      });

      // Sort result by user_task_id
      result.sort((a, b) => a.user_task_id - b.user_task_id);

      ctx.log?.info({ 
        userId,
        latestCode,
        resultCount: result.length,
        mainTasksCount: result.length,
        totalChildTasksCount: result.reduce((sum, task) => sum + (task.sub_user_task?.length || 0), 0)
      }, 'UserTaskRepository.findByUserId - Final result');

      return result;
    } catch (error) {
      ctx.log?.error({ userId, queryParams, error }, 'UserTaskRepository.findByUserId_error');
      throw error;
    }
  }

  /**
   * User tasks whose definition task is non-routine (is_routine = false).
   * Flat list; no batch grouping by code.
   */
  async findNonRoutineByUserId(userId, queryParams = {}, ctx = {}) {
    try {
      ctx.log?.info({ userId, queryParams }, 'UserTaskRepository.findNonRoutineByUserId');
      const {
        limit = 50,
        offset = 0,
        date_from = null,
        date_to = null,
        period = null,
      } = queryParams;

      let dateFilter = {};
      if (date_from || date_to) {
        dateFilter.created_at = {};
        if (date_from) {
          const fromDate = new Date(date_from);
          fromDate.setHours(0, 0, 0, 0);
          dateFilter.created_at[Op.gte] = fromDate;
        }
        if (date_to) {
          const toDate = new Date(date_to);
          toDate.setHours(23, 59, 59, 999);
          dateFilter.created_at[Op.lte] = toDate;
        }
      }

      const whereClause = { user_id: userId, is_routine: false, ...dateFilter };
      if (period && typeof period === 'string' && /^\d{4}-\d{2}$/.test(period.trim())) {
        const p = period.trim();
        whereClause.notes = { [Op.like]: `%"period":"${p}"%` };
      }

      const Role = require('../models/Role');
      const { Asset } = require('../models/Asset');

      const { rows, count } = await this.userTaskModel.findAndCountAll({
        where: whereClause,
        limit: Math.min(500, Math.max(1, parseInt(limit, 10) || 50)),
        offset: Math.max(0, parseInt(offset, 10) || 0),
        order: [
          ['start_at', 'ASC'],
          ['id', 'ASC'],
        ],
        distinct: true,
        include: [
          {
            model: this.taskModel,
            as: 'task',
            required: false,
            attributes: [
              'id',
              'name',
              'duration',
              'is_scan',
              'scan_code',
              'is_need_validation',
              'is_routine',
              'monthly_frequency',
              'asset_id',
              'role_id',
              'non_routine_items',
              'area',
            ],
            include: [
              {
                model: Role,
                as: 'role',
                attributes: ['id', 'name', 'level'],
                required: false,
              },
              {
                model: Asset,
                as: 'asset',
                attributes: ['id', 'name', 'code'],
                required: false,
              },
            ],
          },
          {
            model: this.userTaskEvidenceModel,
            as: 'evidences',
            attributes: ['id', 'user_task_id', 'url', 'created_at'],
          },
        ],
      });

      const list = rows.map((ut) => {
        const j = ut.toJSON();
        if (j.status !== undefined) {
          j.status = UserTaskStatusIntToStr[j.status] || 'pending';
        }
        return j;
      });

      return { rows: list, total: count };
    } catch (error) {
      ctx.log?.error({ userId, queryParams, error }, 'UserTaskRepository.findNonRoutineByUserId_error');
      throw error;
    }
  }

  /**
   * Semua user_task non-rutin untuk dashboard (bukan per user login).
   * @param {{ asset_id?: string, date_from?: string|Date, date_to?: string|Date, limit?: number, offset?: number }} filters
   */
  async findNonRoutineDashboardRows(filters = {}, ctx = {}) {
    try {
      ctx.log?.info({ filters }, 'UserTaskRepository.findNonRoutineDashboardRows');
      const {
        asset_id = null,
        date_from = null,
        date_to = null,
        limit = 500,
        offset = 0,
      } = filters;

      let dateFilter = {};
      if (date_from || date_to) {
        dateFilter.created_at = {};
        if (date_from) {
          const fromDate = new Date(date_from);
          fromDate.setHours(0, 0, 0, 0);
          dateFilter.created_at[Op.gte] = fromDate;
        }
        if (date_to) {
          const toDate = new Date(date_to);
          toDate.setHours(23, 59, 59, 999);
          dateFilter.created_at[Op.lte] = toDate;
        }
      }

      const whereClause = { is_routine: false, ...dateFilter };

      const taskIncludeWhere = {};
      if (asset_id) {
        taskIncludeWhere.asset_id = asset_id;
      }

      const Role = require('../models/Role');
      const { Asset } = require('../models/Asset');

      const { rows, count } = await this.userTaskModel.findAndCountAll({
        where: whereClause,
        limit: Math.min(500, Math.max(1, parseInt(limit, 10) || 500)),
        offset: Math.max(0, parseInt(offset, 10) || 0),
        order: [
          ['start_at', 'ASC'],
          ['id', 'ASC'],
        ],
        distinct: true,
        include: [
          {
            model: this.userModel,
            as: 'user',
            attributes: ['id', 'name', 'email'],
            required: false,
          },
          {
            model: this.taskModel,
            as: 'task',
            required: true,
            ...(Object.keys(taskIncludeWhere).length > 0 ? { where: taskIncludeWhere } : {}),
            attributes: ['id', 'name', 'asset_id', 'role_id', 'duration', 'area'],
            include: [
              {
                model: Role,
                as: 'role',
                attributes: ['id', 'name'],
                required: false,
              },
              {
                model: Asset,
                as: 'asset',
                attributes: ['id', 'name', 'code'],
                required: false,
              },
            ],
          },
        ],
      });

      const list = rows.map((r) => {
        const j = r.toJSON();
        if (j.status !== undefined) {
          j.status = UserTaskStatusIntToStr[j.status] || 'pending';
        }
        return j;
      });

      return { rows: list, total: count };
    } catch (error) {
      ctx.log?.error({ filters, error }, 'UserTaskRepository.findNonRoutineDashboardRows_error');
      throw error;
    }
  }

  async getUpcomingTasks(userId, hoursAhead = 12, ctx = {}) {
    try {
      ctx.log?.info({ userId, hoursAhead }, 'UserTaskRepository.getUpcomingTasks');
      
      const now = moment().tz('Asia/Jakarta');
      const endTime = now.clone().add(hoursAhead, 'hours');
      
      const userTasks = await this.userTaskModel.findAll({
        where: {
          user_id: userId,
          is_routine: true,
          start_at: null, // Not started yet
          completed_at: null, // Not completed yet
          created_at: {
            [Op.between]: [now.toDate(), endTime.toDate()]
          }
        },
        order: [['created_at', 'ASC']],
        include: [
          {
            model: this.taskModel,
            as: 'task',
            attributes: ['id', 'name', 'duration', 'is_scan', 'scan_code', 'is_need_validation']
          },
          {
            model: this.userTaskEvidenceModel,
            as: 'evidences',
            attributes: ['id', 'user_task_id', 'url', 'created_at']
          }
        ]
      });

      return userTasks.map(ut => ut.toJSON());
    } catch (error) {
      ctx.log?.error({ userId, hoursAhead, error }, 'UserTaskRepository.getUpcomingTasks_error');
      throw error;
    }
  }

  async update(id, data, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id, data }, 'UserTaskRepository.update');
      const now = moment().tz('Asia/Jakarta').toDate();
      const updateData = {
        ...data,
        updated_at: now,
      };
      await this.userTaskModel.update(updateData, {
        where: { id },
        transaction: tx
      });
      const userTask = await this.findById(id, ctx);
      return userTask;
    } catch (error) {
      ctx.log?.error({ id, data, error }, 'UserTaskRepository.update_error');
      throw error;
    }
  }

  async startTask(id, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id }, 'UserTaskRepository.startTask');
      const now = moment().tz('Asia/Jakarta').toDate();
      await this.userTaskModel.update({
        start_at: now,
        status: 1,
        updated_at: now,
      }, {
        where: { id },
        transaction: tx
      });
      const userTask = await this.findById(id, ctx);
      return userTask;
    } catch (error) {
      ctx.log?.error({ id, error }, 'UserTaskRepository.startTask_error');
      throw error;
    }
  }

  async completeTask(id, notes = null, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id, notes }, 'UserTaskRepository.completeTask');
      const now = moment().tz('Asia/Jakarta').toDate();
      const updateData = {
        completed_at: now,
        updated_at: now,
        status: 2, // completed
      };
      if (notes) {
        updateData.notes = notes;
      }
      await this.userTaskModel.update(updateData, {
        where: { id },
        transaction: tx
      });
      const userTask = await this.findById(id, ctx);
      return userTask;
    } catch (error) {
      ctx.log?.error({ id, notes, error }, 'UserTaskRepository.completeTask_error');
      throw error;
    }
  }

  async findOneByCode(code, ctx = {}, tx = null) {
    try {
      const row = await this.userTaskModel.findOne({
        where: { code },
        transaction: tx,
      });
      return row ? row.toJSON() : null;
    } catch (error) {
      ctx.log?.error({ code, error }, 'UserTaskRepository.findOneByCode_error');
      throw error;
    }
  }

  async delete(id, ctx = {}, tx = null) {
    try {
      ctx.log?.info({ id }, 'UserTaskRepository.delete');
      await this.userTaskModel.destroy({
        where: { id },
        transaction: tx
      });
      return true;
    } catch (error) {
      ctx.log?.error({ id, error }, 'UserTaskRepository.delete_error');
      throw error;
    }
  }

  async generateUpcomingUserTasks(userId, hoursAhead = 12, ctx = {}) {
    try {
      ctx.log?.info({ userId, hoursAhead }, 'UserTaskRepository.generateUpcomingUserTasks');
      
      const sequelize = require('../models/sequelize');
      const result = await sequelize.transaction(async (t) => {
        // Get user role_id first
        const user = await this.userModel.findByPk(userId, {
          attributes: ['id', 'role_id'],
          transaction: t
        });
        
        if (!user) {
          ctx.log?.error({ userId }, 'User not found');
          throw new Error('User not found');
        }
        
        const userRoleId = user.role_id;
        ctx.log?.info({ userId, userRoleId }, 'User role_id retrieved');
        
        // Get current day and time in Asia/Jakarta timezone
        const now = moment().tz('Asia/Jakarta');
        const currentDay = now.day(); // 0 = Sunday, 1 = Monday, etc.
        const currentDayNumber = currentDay.toString(); // Convert to string to match varchar in database (0-6 or 'all')
        const currentTime = now.format('HH:mm');
        
        ctx.log?.info({ 
          currentDay,
          currentDayNumber,
          currentTime,
          userRoleId
        }, 'Current day and time for schedule matching');
        
        // Find task groups that match the current time
        const allTaskGroups = await this.taskGroupModel.findAll({
          where: {
            is_active: true,
          },
          transaction: t
        });

        // Get time window from environment variable (default: 180 minutes = 3 hours)
        const timeWindowMinutes = parseInt(process.env.TASK_GENERATION_TIME_WINDOW_MINUTES || '180', 10);
        
        // Filter task groups where current time is within the configured time window before OR after start_time
        // (default: 0-180 minutes before or after start_time)
        const matchingTaskGroups = allTaskGroups.filter(tg => {
          const tgJson = tg.toJSON();
          const [startH, startM] = tgJson.start_time.split(':').map(Number);
          const [currentH, currentM] = currentTime.split(':').map(Number);
          
          const startMinutes = startH * 60 + startM;
          const currentMinutes = currentH * 60 + currentM;

          // Calculate time difference in minutes for "before" case
          let timeDiffBeforeMinutes;
          if (currentMinutes <= startMinutes) {
            // Current time is before start_time on the same day
            timeDiffBeforeMinutes = startMinutes - currentMinutes;
          } else {
            // Current time is after start_time, check if it's before start_time tomorrow
            // (e.g., current 23:00, start 07:00 -> 8 hours = 480 minutes)
            timeDiffBeforeMinutes = (24 * 60) - currentMinutes + startMinutes;
          }

          // Calculate time difference in minutes for "after" case
          let timeDiffAfterMinutes;
          if (currentMinutes >= startMinutes) {
            // Current time is after start_time on the same day
            timeDiffAfterMinutes = currentMinutes - startMinutes;
          } else {
            // Current time is before start_time, check if it's after start_time yesterday
            // (e.g., current 06:00, start 19:00 -> check if it's after yesterday's 19:00)
            // This means we're in the early morning, and the shift started yesterday
            timeDiffAfterMinutes = (24 * 60) - startMinutes + currentMinutes;
          }

          // Check if current time is within the configured time window before OR after start_time
          // This gives a configurable window for task generation both before and after shift start
          const isWithinBeforeWindow = timeDiffBeforeMinutes >= 0 && timeDiffBeforeMinutes <= timeWindowMinutes;
          const isWithinAfterWindow = timeDiffAfterMinutes >= 0 && timeDiffAfterMinutes <= timeWindowMinutes;
          
          return isWithinBeforeWindow || isWithinAfterWindow;
        });

        const matchingTaskGroupIds = matchingTaskGroups.map(tg => tg.toJSON().id);
        
        // Only generate user tasks for tasks that belong to matching task groups
        // If no matching task groups found, don't generate any tasks
        if (matchingTaskGroupIds.length === 0) {
          ctx.log?.info({ currentTime }, 'No matching task groups found for current time');
          return {
            created: 0,
            userTasks: []
          };
        }

        // Helper function to parse time
        const parseTime = (timeStr) => {
          if (!timeStr) return 0;
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };

        // Check if user tasks have already been generated for this user in the current task group time range
        // Get tasks that belong to matching task groups AND match user's role to check for existing user tasks
        const tasksToCheck = await this.taskModel.findAll({
          where: {
            task_group_id: { [Op.in]: matchingTaskGroupIds },
            role_id: userRoleId // Filter by user's role_id
          },
          attributes: ['id'],
          transaction: t
        });
        
        const taskIdsToCheck = tasksToCheck.map(t => t.id);
        
        if (taskIdsToCheck.length > 0) {
          // Since we're generating tasks 1 hour before shift starts, we need to check
          // if tasks have already been generated for the upcoming shift
          // Calculate the start of the upcoming shift based on task group times
          const firstTaskGroup = matchingTaskGroups[0].toJSON();
          const [startH, startM] = firstTaskGroup.start_time.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const currentMinutes = parseTime(currentTime);
          const [endH, endM] = firstTaskGroup.end_time.split(':').map(Number);
          const endMinutes = endH * 60 + endM;
          
          // Determine the start and end of the upcoming shift period
          // (the shift that's about to start, since we're generating 1 hour before)
          let shiftStart, shiftEnd;
          
          // Since current time is before start_time (we're 1 hour before), the upcoming shift starts today
          if (endMinutes < startMinutes) {
            // Shift spans midnight (e.g., 19:00 to 04:00)
            // If we're generating before start_time, the shift starts today and ends tomorrow
            shiftStart = now.clone().startOf('day').add(startMinutes, 'minutes');
            shiftEnd = now.clone().add(1, 'day').startOf('day').add(endMinutes, 'minutes');
          } else {
            // Normal shift within same day
            // Shift starts today
            shiftStart = now.clone().startOf('day').add(startMinutes, 'minutes');
            shiftEnd = now.clone().startOf('day').add(endMinutes, 'minutes');
          }
          
          // Check if tasks were already generated for this upcoming shift
          // We check for tasks created in a window around the shift start time
          // (from 2 hours before shift start to shift end, to catch any early generation)
          const checkWindowStart = shiftStart.clone().subtract(2, 'hours');
          const checkWindowEnd = shiftEnd.clone();
          
          const existingUserTasks = await this.userTaskModel.findAll({
            where: {
              user_id: userId,
              task_id: { [Op.in]: taskIdsToCheck },
              created_at: {
                [Op.between]: [checkWindowStart.toDate(), checkWindowEnd.toDate()]
              }
            },
            limit: 1,
            transaction: t
          });
          
          if (existingUserTasks.length > 0) {
            ctx.log?.info({ userId, matchingTaskGroupIds, shiftStart: shiftStart.format(), shiftEnd: shiftEnd.format(), currentTime: now.format() }, 'User tasks already generated for this upcoming task group time range');
            throw new Error('User tasks have already been generated for this task group time range');
          }
        }
        
        // Build where clause for tasks - only get tasks that belong to matching task groups AND match user's role
        const taskWhereClause = {
          task_group_id: { [Op.in]: matchingTaskGroupIds },
          role_id: userRoleId // Filter by user's role_id
        };
        
        ctx.log?.info({ 
          matchingTaskGroupIds,
          userRoleId,
          taskWhereClause
        }, 'Task where clause with role filter');
        
        // First, get all main tasks that belong to matching task groups AND match user's role (regardless of schedules)
        // This ensures main tasks are included even if they don't have schedules
        // Get schedules that match current day OR are 'all' - we need ALL matching schedules, not just one
        const allMainTasks = await this.taskModel.findAll({
          where: {
            ...taskWhereClause,
            is_main_task: true
          },
          include: [
            {
              model: this.taskScheduleModel,
              as: 'schedules',
              where: {
                [Op.or]: [
                  { day_of_week: 'all' },
                  { day_of_week: currentDayNumber }
                ]
              },
              required: false // Make schedules optional - include main tasks even without schedules
              // This will get ALL schedules that match today or are 'all', so a task with multiple times will get all of them
            }
          ],
          transaction: t
        });
        
        ctx.log?.info({ 
          matchingTaskGroupIds,
          currentDayNumber,
          allMainTasksCount: allMainTasks.length,
          allMainTaskIds: allMainTasks.map(t => {
            const tJson = t.toJSON();
            const schedules = tJson.schedules || [];
            return {
              id: t.id,
              name: tJson.name,
              task_group_id: tJson.task_group_id,
              schedulesCount: schedules.length,
              schedules: schedules.map(s => ({ 
                id: s.id,
                day_of_week: s.day_of_week, 
                time: s.time,
                task_id: s.task_id
              }))
            };
          })
        }, 'Found all main tasks from matching task groups with schedules');

        // Get main task IDs to find their child tasks
        const mainTaskIds = allMainTasks.map(t => t.id);
        
        // Determine which main tasks have child tasks
        // This helps us include main tasks even if they don't have schedules
        const mainTaskIdsWithChildren = new Set();
        if (mainTaskIds.length > 0 && this.taskParentModel) {
          const parentRelationsForChildren = await this.taskParentModel.findAll({
            where: { parent_task_id: { [Op.in]: mainTaskIds } },
            attributes: ['parent_task_id'],
            transaction: t
          });
          parentRelationsForChildren.forEach(rel => {
            mainTaskIdsWithChildren.add(rel.parent_task_id);
          });
        }

        // Include ALL main tasks from matching task groups
        // Schedules determine when to create user tasks, not whether to create them
        const tasks = allMainTasks;
        
        ctx.log?.info({ 
          allMainTasksCount: allMainTasks.length,
          tasksCount: tasks.length,
          mainTaskIdsWithChildren: Array.from(mainTaskIdsWithChildren),
          taskIds: tasks.map(t => {
            const tJson = t.toJSON();
            return {
              id: t.id,
              name: tJson.name,
              hasSchedule: (tJson.schedules && tJson.schedules.length > 0),
              hasChildTasks: mainTaskIdsWithChildren.has(t.id)
            };
          })
        }, 'Including all main tasks from matching task groups');

        // Get task IDs from filtered main tasks to find their child tasks
        const taskIds = tasks.map(t => t.id);
        
        // Find all child tasks that have these filtered main tasks as parents
        // Use TaskParent junction table to find child tasks with multiple parents
        let childTasks = [];
        if (taskIds.length > 0 && this.taskParentModel) {
          // Get child task IDs from junction table
          const parentRelations = await this.taskParentModel.findAll({
            where: { parent_task_id: { [Op.in]: taskIds } },
            attributes: ['child_task_id'],
            transaction: t
          });
          const childTaskIds = [...new Set(parentRelations.map(rel => rel.child_task_id))];
          
          if (childTaskIds.length > 0) {
            // Get child tasks - include those with matching schedules OR those without schedules
            // (child tasks should be created when their parents are created)
            // NOTE: Child tasks should be created if their parent is being created,
            // but still filter by role_id to ensure they match user's role
            childTasks = await this.taskModel.findAll({
              where: {
                id: { [Op.in]: childTaskIds },
                role_id: userRoleId // Filter child tasks by user's role_id as well
                // Remove task_group_id filter - child tasks should be included if their parent is included
              },
              include: [
                {
                  model: this.taskScheduleModel,
                  as: 'schedules',
                  where: {
                    [Op.or]: [
                      { day_of_week: 'all' },
                      { day_of_week: currentDayNumber }
                    ]
                  },
                  required: false // Make schedules optional for child tasks
                }
              ],
              transaction: t
            });
          }
        }

        // Combine parent tasks and child tasks for reference
        const allTasks = [...tasks, ...childTasks];

        // Store task info for sorting
        const taskInfoMap = new Map();
        for (const task of allTasks) {
          const taskJson = task.toJSON();
          taskInfoMap.set(task.id, {
            is_main_task: taskJson.is_main_task,
            schedules: taskJson.schedules || []
          });
        }

        // Collect user task data first (before creating in DB)
        // Generate a single code for this generation (to group all user tasks created together)
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        const generationCode = `UT-${timestamp}-${randomSuffix}`;
        
        const userTaskDataToCreate = [];
        
        // Collect user tasks for each scheduled task (parent and child)
        // Only process parent tasks (from 'tasks' array), not child tasks
        // Child tasks will be created when processing their parent tasks
        ctx.log?.info({ 
          tasksToProcessCount: tasks.length,
          taskIds: tasks.map(t => {
            const tJson = t.toJSON();
            return {
              id: t.id,
              name: tJson.name,
              schedulesCount: tJson.schedules?.length || 0
            };
          })
        }, 'Processing tasks to create user tasks');
        
        for (const task of tasks) {
          const taskJson = task.toJSON();
          let taskSchedules = task.schedules || [];
          
          // If schedules are empty, try to reload them
          if (taskSchedules.length === 0 && this.taskScheduleModel) {
            const reloadedSchedules = await this.taskScheduleModel.findAll({
              where: {
                task_id: task.id,
                [Op.or]: [
                  { day_of_week: 'all' },
                  { day_of_week: currentDayNumber }
                ]
              },
              transaction: t
            });
            taskSchedules = reloadedSchedules.map(s => s.toJSON ? s.toJSON() : s);
            ctx.log?.info({ 
              taskId: task.id,
              reloadedSchedulesCount: taskSchedules.length,
              schedules: taskSchedules.map(s => ({ day_of_week: s.day_of_week, time: s.time }))
            }, 'Reloaded schedules for task');
          }
          
          ctx.log?.info({ 
            taskId: task.id,
            taskName: taskJson.name,
            schedulesCount: taskSchedules.length,
            schedules: taskSchedules.map(s => ({ day_of_week: s.day_of_week, time: s.time })),
            isMainTask: taskJson.is_main_task
          }, 'Processing task');
          
          // Get task with related task_parents (child tasks)
          let childTaskIds = [];
          if (this.taskParentModel) {
            const parentRelations = await this.taskParentModel.findAll({
              where: { parent_task_id: task.id },
              attributes: ['child_task_id'],
              transaction: t
            });
            childTaskIds = parentRelations.map(rel => rel.child_task_id);
            ctx.log?.info({ 
              taskId: task.id,
              childTaskIds
            }, 'Found child tasks for main task');
          }
          
          // If task has schedules, collect user task data for each schedule
          // If task has no schedules (e.g., child task without own schedules), collect one user task anyway
          if (taskSchedules.length > 0) {
            ctx.log?.info({ 
              taskId: task.id,
              taskName: taskJson.name,
              schedulesCount: taskSchedules.length,
              schedules: taskSchedules.map(s => {
                const sJson = s.toJSON ? s.toJSON() : s;
                return { day_of_week: sJson.day_of_week, time: sJson.time };
              })
            }, 'Processing task with schedules - will create one user task per schedule');
            
            for (const schedule of taskSchedules) {
              const scheduleJson = schedule.toJSON ? schedule.toJSON() : schedule;
              const scheduleTime = scheduleJson.time || null;
              
              ctx.log?.info({ 
                taskId: task.id,
                taskName: taskJson.name,
                scheduleTime,
                dayOfWeek: scheduleJson.day_of_week
              }, 'Creating user task for schedule');
              
              // Find the task group for this task
              const taskGroup = matchingTaskGroups.find(tg => tg.id === taskJson.task_group_id);
              const taskGroupJson = taskGroup ? taskGroup.toJSON() : null;
              
              // Create main task user task data for this schedule
              const isMainTask = taskJson.is_main_task === true;
              const mainTaskItem = {
                userTaskData: {
                  task_id: task.id,
                  user_id: userId,
                  start_at: null,
                  completed_at: null,
                  notes: null,
                  status: 'pending',
                  code: generationCode,
                  is_main_task: isMainTask,
                  parent_user_task_id: null,
                  time: scheduleTime,
                  is_routine: true,
                },
                sortData: {
                  is_main_task: taskJson.is_main_task || false,
                  scheduleTime: scheduleTime,
                  taskId: task.id,
                  taskGroupStartTime: taskGroupJson?.start_time || null,
                  taskGroupEndTime: taskGroupJson?.end_time || null,
                  isChildOfTaskId: null
                },
                childTasks: [] // Will be populated with child tasks for this schedule
              };
              
              // Create child task user task data for this same schedule
              for (const childTaskId of childTaskIds) {
                let childTask = allTasks.find(t => t.id === childTaskId);
                
                // If child task not found in allTasks, fetch it directly
                if (!childTask && this.taskModel) {
                  childTask = await this.taskModel.findByPk(childTaskId, {
                    include: [
                      {
                        model: this.taskScheduleModel,
                        as: 'schedules',
                        required: false
                      }
                    ],
                    transaction: t
                  });
                }
                
                const childTaskJson = childTask ? childTask.toJSON() : null;
                
                if (childTaskJson) {
                  // Find the task group for the child task
                  const childTaskGroup = matchingTaskGroups.find(tg => tg.id === childTaskJson.task_group_id);
                  const childTaskGroupJson = childTaskGroup ? childTaskGroup.toJSON() : null;
                  
                  const childTaskItem = {
                    userTaskData: {
                      task_id: childTaskId,
                      user_id: userId,
                      start_at: null,
                      completed_at: null,
                      notes: null,
                      status: 'pending',
                      code: generationCode,
                      is_main_task: false,
                      parent_user_task_id: null, // Will be set when creating
                      time: scheduleTime, // Same schedule time as parent
                      is_routine: true,
                    },
                    sortData: {
                      is_main_task: childTaskJson.is_main_task || false,
                      scheduleTime: scheduleTime, // Same schedule as parent
                      taskId: childTaskId,
                      taskGroupStartTime: childTaskGroupJson?.start_time || taskGroupJson?.start_time || null,
                      taskGroupEndTime: childTaskGroupJson?.end_time || taskGroupJson?.end_time || null,
                      isChildOfTaskId: task.id // Track which task this is a child of
                    }
                  };
                  
                  // Link child task to this main task instance
                  mainTaskItem.childTasks.push(childTaskItem);
                }
              }
              
              ctx.log?.info({ 
                taskId: task.id,
                taskName: taskJson.name,
                scheduleTime,
                childTasksCount: mainTaskItem.childTasks.length,
                userTaskDataToCreateCount: userTaskDataToCreate.length + 1
              }, 'Adding main task item to userTaskDataToCreate');
              
              userTaskDataToCreate.push(mainTaskItem);
            }
          } else {
            // Task has no schedules - collect user task data anyway
            ctx.log?.info({ 
              taskId: task.id,
              taskName: taskJson.name,
              isMainTask: taskJson.is_main_task,
              childTaskIdsCount: childTaskIds.length
            }, 'Processing task without schedules');
            
            const taskGroup = matchingTaskGroups.find(tg => tg.id === taskJson.task_group_id);
            const taskGroupJson = taskGroup ? taskGroup.toJSON() : null;
            
            // Create main task user task data
            const isMainTask = taskJson.is_main_task === true;
            const mainTaskItem = {
              userTaskData: {
                task_id: task.id,
                user_id: userId,
                start_at: null,
                completed_at: null,
                notes: null,
                status: 'pending',
                code: generationCode,
                is_main_task: isMainTask,
                parent_user_task_id: null,
                time: null, // No schedule time for tasks without schedules
                is_routine: true,
              },
              sortData: {
                is_main_task: taskJson.is_main_task || false,
                scheduleTime: null, // No schedule time
                taskId: task.id,
                taskGroupStartTime: taskGroupJson?.start_time || null,
                taskGroupEndTime: taskGroupJson?.end_time || null,
                isChildOfTaskId: null
              },
              childTasks: [] // Will be populated with child tasks
            };
            
            // Create child task user task data
            for (const childTaskId of childTaskIds) {
              let childTask = allTasks.find(t => t.id === childTaskId);
              
              // If child task not found in allTasks, fetch it directly
              if (!childTask && this.taskModel) {
                childTask = await this.taskModel.findByPk(childTaskId, {
                  include: [
                    {
                      model: this.taskScheduleModel,
                      as: 'schedules',
                      required: false
                    }
                  ],
                  transaction: t
                });
              }
              
              const childTaskJson = childTask ? childTask.toJSON() : null;
              
              if (childTaskJson) {
                // Find the task group for the child task
                const childTaskGroup = matchingTaskGroups.find(tg => tg.id === childTaskJson.task_group_id);
                const childTaskGroupJson = childTaskGroup ? childTaskGroup.toJSON() : null;
                
                const childTaskItem = {
                  userTaskData: {
                    task_id: childTaskId,
                    user_id: userId,
                    start_at: null,
                    completed_at: null,
                    notes: null,
                    status: 'pending',
                    code: generationCode,
                    is_main_task: false,
                    parent_user_task_id: null, // Will be set when creating
                    time: null, // No schedule time for tasks without schedules
                    is_routine: true,
                  },
                  sortData: {
                    is_main_task: childTaskJson.is_main_task || false,
                    scheduleTime: null, // No schedule time
                    taskId: childTaskId,
                    taskGroupStartTime: childTaskGroupJson?.start_time || taskGroupJson?.start_time || null,
                    taskGroupEndTime: childTaskGroupJson?.end_time || taskGroupJson?.end_time || null,
                    isChildOfTaskId: task.id // Track which task this is a child of
                  }
                };
                
                // Link child task to this main task instance
                mainTaskItem.childTasks.push(childTaskItem);
              }
            }
            
            userTaskDataToCreate.push(mainTaskItem);
          }
        }

        // Since child tasks are already linked to their parent main tasks in the collection phase,
        // userTaskDataToCreate only contains main tasks (each with their childTasks array populated)
        // So we can use all items directly
        const mainTaskDataToCreate = userTaskDataToCreate;
        
        // Log summary of what will be created
        const summary = mainTaskDataToCreate.map(item => ({
          taskId: item.userTaskData.task_id,
          scheduleTime: item.sortData.scheduleTime,
          childTasksCount: item.childTasks?.length || 0
        }));
        ctx.log?.info({ 
          totalMainTasksToCreate: mainTaskDataToCreate.length,
          summary
        }, 'Summary of user tasks to be created - one per schedule');
        
        // Ensure all items have childTasks array initialized
        mainTaskDataToCreate.forEach(item => {
          if (!item.childTasks) {
            item.childTasks = [];
          }
        });

        // Sort main tasks purely by schedule time, using task group start_time as reference
        mainTaskDataToCreate.sort((a, b) => {
          const aSort = a.sortData;
          const bSort = b.sortData;
          
          const aTime = aSort.scheduleTime;
          const bTime = bSort.scheduleTime;
          
          // If no time specified, put at the end
          if (!aTime && !bTime) {
            // If both have no time, sort by task_id to maintain consistent order
            return aSort.taskId - bSort.taskId;
          }
          if (!aTime) return 1;
          if (!bTime) return -1;
          
          // Parse time to minutes for comparison
          const parseTime = (timeStr) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
          };
          
          const aMinutes = parseTime(aTime);
          const bMinutes = parseTime(bTime);
          
          // Get task group times for determining "today" vs "tomorrow"
          const aGroupStart = parseTime(aSort.taskGroupStartTime);
          const aGroupEnd = parseTime(aSort.taskGroupEndTime);
          const bGroupStart = parseTime(bSort.taskGroupStartTime);
          const bGroupEnd = parseTime(bSort.taskGroupEndTime);
          
          // Determine if time is in current shift or next shift
          // For shift that spans midnight (e.g., 19:00 to 04:00):
          // - Times from start_time to 23:59 are "today" (early shift)
          // - Times from 00:00 to end_time are "today" (late shift)
          // - Times after end_time but before start_time are "tomorrow" (next shift)
          const getShiftOffset = (timeMinutes, groupStart, groupEnd) => {
            if (!groupStart && !groupEnd) return 0;
            
            // If shift doesn't span midnight (normal case)
            if (groupEnd >= groupStart) {
              // Time is in shift range = today (0), outside = tomorrow (1)
              return (timeMinutes >= groupStart && timeMinutes <= groupEnd) ? 0 : 1;
            }
            
            // Shift spans midnight (e.g., 19:00 to 04:00)
            // Times from start to 23:59 (1440 minutes) are "today"
            // Times from 0 to end are "today"
            // Times from end+1 to start-1 are "tomorrow"
            if (timeMinutes >= groupStart || timeMinutes <= groupEnd) {
              return 0; // In current shift (today)
            }
            return 1; // Outside current shift (tomorrow)
          };
          
          // Calculate sort order based on shift offset and time
          const getSortValue = (timeMinutes, groupStart, groupEnd) => {
            const shiftOffset = getShiftOffset(timeMinutes, groupStart, groupEnd);
            
            if (shiftOffset === 0) {
              // Within current shift - handle midnight wrap-around
              if (groupEnd < groupStart && timeMinutes <= groupEnd) {
                // Time is in the late part of shift (00:00 to end_time)
                // Add 1440 to make it sort after early times (19:00-23:59)
                return timeMinutes + 1440;
              }
              // Time is in early part of shift (start_time to 23:59)
              return timeMinutes;
            }
            
            // Outside current shift (tomorrow)
            // Add a large number to ensure they come after today
            return shiftOffset * 1440 + timeMinutes;
          };
          
          const aSortValue = getSortValue(aMinutes, aGroupStart, aGroupEnd);
          const bSortValue = getSortValue(bMinutes, bGroupStart, bGroupEnd);
          
          // Compare by calculated sort value
          if (aSortValue !== bSortValue) {
            return aSortValue - bSortValue;
          }
          
          // If same sort value, maintain order by task_id for consistency
          return aSort.taskId - bSort.taskId;
        });
        
        // Now create all user tasks in sorted order
        const createdUserTasks = [];
        const mainTaskUserTasks = [];
        
        // Helper function to create user task and attach sort data
        const createUserTaskWithSortData = async (item) => {
          const userTask = await this.create(item.userTaskData, ctx, t);
          userTask._sortData = item.sortData;
          if (item.childTasks) {
            userTask.childTasks = [];
          }
          return userTask;
        };
        
        // Create main tasks in sorted order
        for (const mainTaskItem of mainTaskDataToCreate) {
          const mainUserTask = await createUserTaskWithSortData(mainTaskItem);
          
          ctx.log?.info({ 
            mainTaskId: mainTaskItem.userTaskData.task_id,
            mainUserTaskId: mainUserTask.id,
            scheduleTime: mainTaskItem.sortData.scheduleTime,
            childTasksCount: mainTaskItem.childTasks?.length || 0
          }, 'Creating main user task with children');
          
          // Create child tasks for this main task if any
          if (mainTaskItem.childTasks && mainTaskItem.childTasks.length > 0) {
            for (const childTaskItem of mainTaskItem.childTasks) {
              // Set parent_user_task_id for child user task
              childTaskItem.userTaskData.parent_user_task_id = mainUserTask.id;
              childTaskItem.userTaskData.is_main_task = false; // Ensure child tasks are marked as not main
              
              ctx.log?.info({ 
                childTaskId: childTaskItem.userTaskData.task_id,
                parentUserTaskId: mainUserTask.id,
                scheduleTime: childTaskItem.sortData.scheduleTime
              }, 'Creating child user task');
              
              const childUserTask = await createUserTaskWithSortData(childTaskItem);
              
              // Verify parent_user_task_id was set correctly
              if (!childUserTask.parent_user_task_id || childUserTask.parent_user_task_id !== mainUserTask.id) {
                ctx.log?.error({ 
                  childUserTaskId: childUserTask.id,
                  expectedParentId: mainUserTask.id,
                  actualParentId: childUserTask.parent_user_task_id
                }, 'WARNING: Child user task parent_user_task_id mismatch!');
              }
              
              mainUserTask.childTasks.push(childUserTask);
              createdUserTasks.push(childUserTask);
            }
          }
          
          mainTaskUserTasks.push(mainUserTask);
          createdUserTasks.push(mainUserTask);
        }
        
        // Remove temporary sort data from all user tasks
        const removeSortData = (ut) => {
          delete ut._sortData;
          if (ut.childTasks && Array.isArray(ut.childTasks)) {
            ut.childTasks.forEach(ct => removeSortData(ct));
          }
        };
        
        mainTaskUserTasks.forEach(ut => removeSortData(ut));
        
        // Calculate total created (main tasks + child tasks)
        const totalCreated = createdUserTasks.length;
        
        return {
          created: totalCreated,
          userTasks: mainTaskUserTasks
        };
      });

      return result;
    } catch (error) {
      ctx.log?.error({ userId, hoursAhead, error }, 'UserTaskRepository.generateUpcomingUserTasks_error');
      throw error;
    }
  }
}

module.exports = UserTaskRepository;
