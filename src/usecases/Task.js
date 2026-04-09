const { randomUUID } = require("crypto");
const sequelize = require("../models/sequelize");

/**
 * Non-routine task detail: `non_routine_items` must list every frequency slot (length === monthly_frequency).
 * Mutates plain task payload in place.
 * @param {Record<string, unknown>} taskPayload
 */
function normalizeNonRoutineDetailResponse(taskPayload) {
  if (taskPayload.is_routine !== false) {
    return;
  }

  const freq = Math.min(5, Math.max(1, Number(taskPayload.monthly_frequency) || 1));
  taskPayload.monthly_frequency = freq;

  let items = taskPayload.non_routine_items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) {
    items = [];
  }

  const mapRow = (it) => {
    if (!it || typeof it !== "object") {
      return { due_date: null, area: null, assigned_user_id: null };
    }
    let due_date = null;
    if (it.due_date != null && it.due_date !== "") {
      const n = Number(it.due_date);
      if (Number.isInteger(n) && n >= 1 && n <= 28) {
        due_date = n;
      }
    }
    const areaRaw = it.area;
    const area =
      areaRaw != null && String(areaRaw).trim() !== "" ? String(areaRaw) : null;
    return {
      due_date,
      area,
      assigned_user_id: it.assigned_user_id || null,
    };
  };

  const taskDue =
    taskPayload.due_date != null && taskPayload.due_date !== ""
      ? Number(taskPayload.due_date)
      : null;
  const taskDueOk =
    taskDue != null && Number.isInteger(taskDue) && taskDue >= 1 && taskDue <= 28
      ? taskDue
      : null;

  let normalized =
    items.length > 0
      ? items.map(mapRow)
      : [
          {
            due_date: taskDueOk,
            area: taskPayload.area || null,
            assigned_user_id: taskPayload.assigned_user_id || null,
          },
        ];

  while (normalized.length < freq) {
    normalized.push({ due_date: null, area: null, assigned_user_id: null });
  }
  if (normalized.length > freq) {
    normalized = normalized.slice(0, freq);
  }

  taskPayload.non_routine_items = normalized;
}

class TaskUsecase {
  constructor(taskRepository, taskScheduleRepository, taskLogRepository, taskParentRepository) {
    this.taskRepository = taskRepository;
    this.taskScheduleRepository = taskScheduleRepository;
    this.taskLogRepository = taskLogRepository;
    this.taskParentRepository = taskParentRepository;
  }

  async createTask(data, ctx) {
    try {
      ctx.log?.info(data, "TaskUsecase.createTask");
      const result = await sequelize.transaction(async (t) => {
        console.log("im here1", ctx)
        let createData = {
          name: data.name,
          is_routine: data.is_routine !== undefined ? data.is_routine : true,
          is_main_task: data.is_main_task,
          is_need_validation: data.is_need_validation,
          is_scan: data.is_scan,
          scan_code: data.scan_code,
          duration: data.duration,
          asset_id: data.asset_id,
          role_id: data.role_id,
          is_all_times: data.is_all_times,
          task_group_id: data.task_group_id || null,
          monthly_frequency: data.monthly_frequency !== undefined ? parseInt(data.monthly_frequency, 10) : null,
          due_date: data.due_date !== undefined && data.due_date !== null ? parseInt(data.due_date, 10) : null,
          area: data.area || null,
          assigned_user_id: data.assigned_user_id || null,
          non_routine_items: Array.isArray(data.non_routine_items) ? data.non_routine_items : null,
          non_routine_group_id:
            data.is_routine === false
              ? data.non_routine_group_id || randomUUID()
              : null,
          created_by: ctx.userId,
        };
        const task = await this.taskRepository.create(t, createData, ctx);
        
        // Handle multiple parent tasks using junction table
        if (task && data.parent_task_ids && Array.isArray(data.parent_task_ids) && data.parent_task_ids.length > 0) {
          await this.taskParentRepository.createMany(task.id, data.parent_task_ids, ctx, t);
        }
        
        if (task) {
          const baseScheduleData = {
            task_id: task.id,
            created_by: ctx.userId,
          };

          if (data.days && data.days.length > 0) {
            // Days provided: use current logic
            for (let i = 0; i < data.days.length; i++) {
              const dayOfWeek = data.days[i];
              if (data.times && data.times.length > 0) {
                for (let j = 0; j < data.times.length; j++) {
                  const taskScheduleData = {
                    ...baseScheduleData,
                    day_of_week: dayOfWeek,
                    time: data.times[j],
                  };
                  await this.taskScheduleRepository.create(
                    t,
                    taskScheduleData,
                    ctx
                  );
                }
              } else {
                const taskScheduleData = {
                  ...baseScheduleData,
                  day_of_week: dayOfWeek,
                };
                await this.taskScheduleRepository.create(
                  t,
                  taskScheduleData,
                  ctx
                );
              }
            }
          } else {
            // Days empty: create for all times with day_of_week = "all"
            if (data.times && data.times.length > 0) {
              for (let j = 0; j < data.times.length; j++) {
                const taskScheduleData = {
                  ...baseScheduleData,
                  day_of_week: "all",
                  time: data.times[j],
                };
                await this.taskScheduleRepository.create(
                  t,
                  taskScheduleData,
                  ctx
                );
              }
            } else {
              const taskScheduleData = {
                ...baseScheduleData,
                day_of_week: "all",
              };
              await this.taskScheduleRepository.create(t, taskScheduleData, ctx);
            }
          }
        }

        return task;
      });
      return result;
    } catch (error) {
      ctx.log?.error(
        { req: data, error: error },
        "TaskUsecase.createTask_error"
      );
      throw error;
    }
  }

  async updateTask(id, data, ctx) {
    try {
      ctx.log?.info({ id, data }, "TaskUsecase.updateTask");
      const result = await sequelize.transaction(async (t) => {
        // First check if task exists
        const existingTask = await this.taskRepository.findById(id, ctx);
        if (!existingTask) {
          return null;
        }

        // Update task data
        let updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.is_routine !== undefined) updateData.is_routine = data.is_routine;
        if (data.is_main_task !== undefined) updateData.is_main_task = data.is_main_task;
        if (data.is_need_validation !== undefined) updateData.is_need_validation = data.is_need_validation;
        if (data.is_scan !== undefined) updateData.is_scan = data.is_scan;
        if (data.scan_code !== undefined) updateData.scan_code = data.scan_code;
        if (data.duration !== undefined) updateData.duration = data.duration;
        if (data.asset_id !== undefined) updateData.asset_id = data.asset_id;
        if (data.role_id !== undefined) updateData.role_id = data.role_id;
        if (data.is_all_times !== undefined) updateData.is_all_times = data.is_all_times;
        if (data.task_group_id !== undefined) updateData.task_group_id = data.task_group_id;
        if (data.monthly_frequency !== undefined) updateData.monthly_frequency = data.monthly_frequency !== null ? parseInt(data.monthly_frequency, 10) : null;
        if (data.due_date !== undefined) updateData.due_date = data.due_date !== null ? parseInt(data.due_date, 10) : null;
        if (data.area !== undefined) updateData.area = data.area || null;
        if (data.assigned_user_id !== undefined) updateData.assigned_user_id = data.assigned_user_id || null;
        if (data.non_routine_items !== undefined) updateData.non_routine_items = Array.isArray(data.non_routine_items) ? data.non_routine_items : null;
        if (data.is_routine === true) {
          updateData.non_routine_group_id = null;
        } else if (data.non_routine_group_id !== undefined) {
          updateData.non_routine_group_id = data.non_routine_group_id || null;
        } else if (data.is_routine === false) {
          const existingJson = existingTask.toJSON ? existingTask.toJSON() : existingTask;
          if (!existingJson.non_routine_group_id) {
            updateData.non_routine_group_id = randomUUID();
          }
        }
        updateData.updated_by = ctx.userId;
        updateData.updated_at = new Date(); // Update the updated_at timestamp

        const task = await this.taskRepository.update(id, updateData, ctx, t);

        // Handle schedule updates (days and times)
        if (data.days !== undefined || data.times !== undefined) {
          // Delete existing schedules
          await this.taskScheduleRepository.deleteByTaskId(id, ctx, t);
          
          // Create new schedules based on provided days and times
          const baseScheduleData = {
            task_id: id,
            created_by: ctx.userId,
          };

          if (data.days && data.days.length > 0) {
            // Days provided: use current logic
            for (let i = 0; i < data.days.length; i++) {
              const dayOfWeek = data.days[i];
              if (data.times && data.times.length > 0) {
                for (let j = 0; j < data.times.length; j++) {
                  const taskScheduleData = {
                    ...baseScheduleData,
                    day_of_week: dayOfWeek,
                    time: data.times[j],
                  };
                  await this.taskScheduleRepository.create(
                    t,
                    taskScheduleData,
                    ctx
                  );
                }
              } else {
                const taskScheduleData = {
                  ...baseScheduleData,
                  day_of_week: dayOfWeek,
                };
                await this.taskScheduleRepository.create(
                  t,
                  taskScheduleData,
                  ctx
                );
              }
            }
          } else {
            // Days empty: create for all times with day_of_week = "all"
            if (data.times && data.times.length > 0) {
              for (let j = 0; j < data.times.length; j++) {
                const taskScheduleData = {
                  ...baseScheduleData,
                  day_of_week: "all",
                  time: data.times[j],
                };
                await this.taskScheduleRepository.create(
                  t,
                  taskScheduleData,
                  ctx
                );
              }
            } else {
              const taskScheduleData = {
                ...baseScheduleData,
                day_of_week: "all",
              };
              await this.taskScheduleRepository.create(t, taskScheduleData, ctx);
            }
          }
        }

        // Handle multiple parent tasks using junction table
        if (data.parent_task_ids !== undefined) {
          // Delete existing parent relationships
          await this.taskParentRepository.deleteByChildTask(id, ctx, t);
          // Create new parent relationships if provided
          if (Array.isArray(data.parent_task_ids) && data.parent_task_ids.length > 0) {
            await this.taskParentRepository.createMany(id, data.parent_task_ids, ctx, t);
          }
        }

        // Get parent_task_id from junction table for logging (use first parent if multiple)
        let parentTaskIdForLog = null;
        if (this.taskParentRepository) {
          const parentTaskIds = await this.taskParentRepository.getParentTaskIds(id, ctx);
          if (parentTaskIds && parentTaskIds.length > 0) {
            parentTaskIdForLog = parentTaskIds[0]; // Use first parent for log
          }
        }

        // Create log entry (pass parent_task_id from junction table)
        if (!id || !task) {
          ctx.log?.error({ id, task: !!task }, "TaskUsecase.updateTask_missing_id_or_task");
          throw new Error("Task ID or task data is missing");
        }
        
        // Extract only the fields we need for the log, avoiding circular references
        const taskData = task.toJSON ? task.toJSON() : task;
        const logEntryData = {
          id: id, // Explicitly set task_id (mapped from id in repository)
          name: taskData.name,
          is_main_task: taskData.is_main_task,
          is_need_validation: taskData.is_need_validation,
          is_scan: taskData.is_scan,
          scan_code: taskData.scan_code,
          duration: taskData.duration,
          asset_id: taskData.asset_id,
          role_id: taskData.role_id,
          is_all_times: taskData.is_all_times,
          parent_task_id: parentTaskIdForLog
        };
        
        ctx.log?.info({ 
          id, 
          name: logEntryData.name, 
          asset_id: logEntryData.asset_id, 
          role_id: logEntryData.role_id,
          parentTaskIdForLog 
        }, "TaskUsecase.updateTask_creating_log");
        
        try {
          await this.taskLogRepository.create(logEntryData, ctx, t);
        } catch (logError) {
          ctx.log?.error({ 
            id, 
            name: logEntryData.name,
            error: logError.message, 
            errorStack: logError.stack 
          }, "TaskUsecase.updateTask_create_log_error");
          throw logError;
        }

        // Get schedules using taskScheduleRepository (within transaction to see newly created schedules)
        const schedules = await this.taskScheduleRepository.findByTaskId(id, ctx, t);
        
        // Convert task to plain JSON to avoid circular references in response
        const taskJson = task.toJSON ? task.toJSON() : task;
        // Clean up associations to plain objects to avoid circular references
        const cleanedTask = {
          id: taskJson.id,
          name: taskJson.name,
          is_routine: taskJson.is_routine,
          is_main_task: taskJson.is_main_task,
          is_need_validation: taskJson.is_need_validation,
          is_scan: taskJson.is_scan,
          scan_code: taskJson.scan_code,
          duration: taskJson.duration,
          asset_id: taskJson.asset_id,
          role_id: taskJson.role_id,
          is_all_times: taskJson.is_all_times,
          task_group_id: taskJson.task_group_id,
          monthly_frequency: taskJson.monthly_frequency,
          due_date: taskJson.due_date,
          area: taskJson.area,
          assigned_user_id: taskJson.assigned_user_id,
          non_routine_items: taskJson.non_routine_items,
          non_routine_group_id: taskJson.non_routine_group_id,
          created_by: taskJson.created_by,
          created_at: taskJson.created_at,
          updated_at: taskJson.updated_at,
          parent_task_ids: taskJson.parent_task_ids || []
        };
        
        // Process schedules to extract days and times arrays
        const daysSet = new Set();
        const timesSet = new Set();
        
        schedules.forEach(schedule => {
          if (schedule.day_of_week && schedule.day_of_week !== 'all') {
            daysSet.add(schedule.day_of_week);
          }
          if (schedule.time) {
            timesSet.add(schedule.time);
          }
        });
        
        cleanedTask.days = Array.from(daysSet).sort();
        cleanedTask.times = Array.from(timesSet).sort();
        
        // Extract only needed fields from associations to avoid circular references
        if (taskJson.createdBy) {
          cleanedTask.createdBy = {
            id: taskJson.createdBy.id,
            name: taskJson.createdBy.name,
            email: taskJson.createdBy.email
          };
        }
        if (taskJson.role) {
          cleanedTask.role = {
            id: taskJson.role.id,
            name: taskJson.role.name,
            level: taskJson.role.level
          };
        }
        if (taskJson.asset) {
          cleanedTask.asset = {
            id: taskJson.asset.id,
            name: taskJson.asset.name,
            code: taskJson.asset.code
          };
        }
        
        return cleanedTask;
      });
      return result;
    } catch (error) {
      ctx.log?.error(
        { id, data, error: error.message, errorStack: error.stack },
        "TaskUsecase.updateTask_error"
      );
      throw error;
    }
  }

  async getTaskById(id, ctx) {
    try {
      ctx.log?.info({ id }, "TaskUsecase.getTaskById");
      const task = await this.taskRepository.findById(id, ctx);
      
      if (!task) {
        return null;
      }
    
      // Get parent_task_ids from task instance before converting to JSON
      // (it might be set directly on the instance or in dataValues)
      const parentTaskIds = task.parent_task_ids || 
                           (task.dataValues && task.dataValues.parent_task_ids) || 
                           [];
      
      const taskJson = task.toJSON ? task.toJSON() : task;
      
      // Get schedules using taskScheduleRepository
      const schedules = await this.taskScheduleRepository.findByTaskId(id, ctx);
      
      // Extract associations before building response (to avoid circular refs)
      const createdBy = taskJson.createdBy;
      const role = taskJson.role;
      const asset = taskJson.asset;
      const taskGroup = taskJson.taskGroup;
      
      // Remove association objects to avoid circular references
      delete taskJson.createdBy;
      delete taskJson.role;
      delete taskJson.asset;
      delete taskJson.taskGroup;
      delete taskJson.parent_task_ids;
      
      // Build response with all task attributes
      const cleanedTask = {
        ...taskJson, // Include all task attributes (id, name, is_main_task, etc.)
        parent_task_ids: parentTaskIds,
        schedules: schedules
      };
      
      // Process schedules to extract days and times arrays
      const daysSet = new Set();
      const timesSet = new Set();
      
      schedules.forEach(schedule => {
        if (schedule.day_of_week && schedule.day_of_week !== 'all') {
          daysSet.add(schedule.day_of_week);
        }
        if (schedule.time) {
          timesSet.add(schedule.time);
        }
      });
      
      cleanedTask.days = Array.from(daysSet).sort();
      cleanedTask.times = Array.from(timesSet).sort();
      
      // Add cleaned associations as plain objects
      if (createdBy) {
        cleanedTask.createdBy = {
          id: createdBy.id,
          name: createdBy.name,
          email: createdBy.email
        };
      }
      if (role) {
        cleanedTask.role = {
          id: role.id,
          name: role.name,
          level: role.level
        };
      }
      if (asset) {
        cleanedTask.asset = {
          id: asset.id,
          name: asset.name,
          code: asset.code
        };
      }
      if (taskGroup) {
        cleanedTask.taskGroup = {
          id: taskGroup.id,
          name: taskGroup.name,
          start_time: taskGroup.start_time,
          end_time: taskGroup.end_time,
          is_active: taskGroup.is_active
        };
      }

      normalizeNonRoutineDetailResponse(cleanedTask);

      return cleanedTask;
    } catch (error) {
      ctx.log?.error(
        { id, error: error.message, errorStack: error.stack },
        "TaskUsecase.getTaskById_error"
      );
      throw error;
    }
  }

  async getAllTasks(filters = {}, ctx) {
    try {
      ctx.log?.info({ filters }, "TaskUsecase.getAllTasks");
      const result = await this.taskRepository.findAll(filters, ctx);
      
      // Clean up associations to avoid circular references
      const cleanedTasks = result.tasks.map(task => {
        const cleanedTask = {
          id: task.id,
          name: task.name,
          is_routine: task.is_routine,
          is_main_task: task.is_main_task,
          is_need_validation: task.is_need_validation,
          is_scan: task.is_scan,
          scan_code: task.scan_code,
          duration: task.duration,
          asset_id: task.asset_id,
          role_id: task.role_id,
          is_all_times: task.is_all_times,
          task_group_id: task.task_group_id,
          monthly_frequency: task.monthly_frequency,
          due_date: task.due_date,
          area: task.area,
          assigned_user_id: task.assigned_user_id,
          non_routine_items: task.non_routine_items,
          non_routine_group_id: task.non_routine_group_id,
          created_by: task.created_by,
          created_at: task.created_at,
          updated_at: task.updated_at,
          parent_task_ids: task.parent_task_ids || []
        };
        
        // Extract only needed fields from associations
        if (task.createdBy) {
          cleanedTask.createdBy = {
            id: task.createdBy.id,
            name: task.createdBy.name,
            email: task.createdBy.email
          };
        }
        if (task.role) {
          cleanedTask.role = {
            id: task.role.id,
            name: task.role.name,
            level: task.role.level
          };
        }
        if (task.asset) {
          cleanedTask.asset = {
            id: task.asset.id,
            name: task.asset.name,
            code: task.asset.code
          };
        }
        if (task.taskGroup) {
          cleanedTask.taskGroup = {
            id: task.taskGroup.id,
            name: task.taskGroup.name,
            start_time: task.taskGroup.start_time,
            end_time: task.taskGroup.end_time,
            is_active: task.taskGroup.is_active
          };
        }
        
        return cleanedTask;
      });
      
      return {
        tasks: cleanedTasks,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        totalPages: result.totalPages,
        currentPage: result.currentPage
      };
    } catch (error) {
      ctx.log?.error(
        { filters, error: error.message, errorStack: error.stack },
        "TaskUsecase.getAllTasks_error"
      );
      throw error;
    }
  }

  async deleteTask(id, ctx) {
    try {
      ctx.log?.info({ id }, "TaskUsecase.deleteTask");
      const result = await sequelize.transaction(async (t) => {
        // First check if task exists
        const existingTask = await this.taskRepository.findById(id, ctx);
        if (!existingTask) {
          return null;
        }

        const taskJson = existingTask.toJSON ? existingTask.toJSON() : existingTask;
        
        // Create log entry before deletion
        const logEntryData = {
          id: id,
          name: taskJson.name,
          is_main_task: taskJson.is_main_task,
          is_need_validation: taskJson.is_need_validation,
          is_scan: taskJson.is_scan,
          scan_code: taskJson.scan_code,
          duration: taskJson.duration,
          asset_id: taskJson.asset_id,
          role_id: taskJson.role_id,
          is_all_times: taskJson.is_all_times,
          parent_task_id: null // Will be set from parent relations
        };
        
        // Get parent_task_id from junction table for logging (use first parent if multiple)
        let parentTaskIdForLog = null;
        if (this.taskParentRepository) {
          const parentTaskIds = await this.taskParentRepository.getParentTaskIds(id, ctx);
          if (parentTaskIds && parentTaskIds.length > 0) {
            parentTaskIdForLog = parentTaskIds[0];
            logEntryData.parent_task_id = parentTaskIdForLog;
          }
        }
        
        // Create log entry
        try {
          await this.taskLogRepository.create(logEntryData, ctx, t);
        } catch (logError) {
          ctx.log?.error({ 
            id, 
            error: logError.message, 
            errorStack: logError.stack 
          }, "TaskUsecase.deleteTask_create_log_error");
          // Don't throw - continue with deletion even if log fails
        }

        // Delete related data first
        // Delete task schedules
        await this.taskScheduleRepository.deleteByTaskId(id, ctx, t);
        
        // Delete parent relationships (where this task is a child)
        if (this.taskParentRepository) {
          await this.taskParentRepository.deleteByChildTask(id, ctx, t);
        }
        
        // Delete parent relationships (where this task is a parent)
        if (this.taskParentRepository) {
          await this.taskParentRepository.deleteByParentTask(id, ctx, t);
        }
        
        // Delete the task itself
        const deleted = await this.taskRepository.delete(id, ctx, t);
        
        return deleted;
      });
      return result;
    } catch (error) {
      ctx.log?.error(
        { id, error: error.message, errorStack: error.stack },
        "TaskUsecase.deleteTask_error"
      );
      throw error;
    }
  }

  async getTaskLogs(id, ctx) {
    try {
      ctx.log?.info({ id }, "TaskUsecase.getTaskLogs");
      const taskLogs = await this.taskLogRepository.getByTaskID(id, ctx);
      return taskLogs;
    } catch (error) {
      ctx.log?.error(
        { id, error: error },
        "TaskUsecase.getTaskLogs_error"
      );
      throw error;
    }
  }
}

module.exports = TaskUsecase;
