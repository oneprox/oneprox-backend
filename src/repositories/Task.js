class TaskRepository {
  constructor(taskModel, userModel, roleModel, assetModel, taskGroupModel, taskParentModel) {
    this.taskModel = taskModel;
    this.userModel = userModel;
    this.roleModel = roleModel;
    this.assetModel = assetModel;
    this.taskGroupModel = taskGroupModel;
    this.taskParentModel = taskParentModel;
  }

  async create(transaction = null, data, ctx) {
    try {
      ctx.log?.info(data, "TaskRepository.create");
      const task = await this.taskModel.create(data, { transaction });
      return task;
    } catch (error) {
      ctx.log?.error({ data, error}, "TaskRepository.create_error");
      throw error;
    }
  }

  async findById(id, ctx) {
    try {
      ctx.log?.info({ id }, "TaskRepository.findById");
      const task = await this.taskModel.findByPk(id, {
        include: [
          {
            model: this.userModel,
            as: 'createdBy',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.roleModel,
            as: 'role',
            attributes: ['id', 'name', 'level']
          },
          {
            model: this.assetModel,
            as: 'asset',
            attributes: ['id', 'name', 'code']
          },
          {
            model: this.taskGroupModel,
            as: 'taskGroup',
            attributes: ['id', 'name', 'start_time', 'end_time', 'is_active'],
            required: false
          },
        ]
      });
      
      if (!task) {
        return null;
      }
      
      // Get parent task IDs from junction table
      let parentTaskIds = [];
      if (this.taskParentModel) {
        const parentRelations = await this.taskParentModel.findAll({
          where: { child_task_id: id },
          attributes: ['parent_task_id']
        });
        ctx.log?.info({ id, parentRelationsCount: parentRelations.length, parentRelations }, "TaskRepository.findById_parentRelations");
        parentTaskIds = parentRelations.map(rel => {
          const parentId = rel.get ? rel.get('parent_task_id') : rel.parent_task_id;
          return parentId;
        });
        ctx.log?.info({ id, parentTaskIds }, "TaskRepository.findById_parentTaskIds");
      }
      
      // Attach parent_task_ids to the Sequelize instance's dataValues
      // so it will be included when toJSON() is called
      if (task.dataValues) {
        task.dataValues.parent_task_ids = parentTaskIds;
      } else {
        task.parent_task_ids = parentTaskIds;
      }
      
      // Also set it directly on the instance for direct access
      task.parent_task_ids = parentTaskIds;
      
      return task;
    } catch (error) {
      ctx.log?.error({ id, error }, "TaskRepository.findById_error");
      throw error;
    }
  }

  async update(id, data, ctx, transaction = null) {
    try {
      ctx.log?.info({ id, data }, "TaskRepository.update");
      await this.taskModel.update(data, {
        where: { id },
        transaction
      });
      const task = await this.findById(id, ctx);
      return task;
    } catch (error) {
      ctx.log?.error({ id, data, error }, "TaskRepository.update_error");
      throw error;
    }
  }

  async findAll(filters = {}, ctx = {}) {
    try {
      ctx.log?.info({ filters }, "TaskRepository.findAll");
      const { Op } = require('sequelize');
      
      const whereClause = {};
      let taskIdsToInclude = null; // Will contain IDs of tasks to include (parent + children)
      
      // Add filters if provided
      if (filters.task_group_id) {
        // First, find all tasks with the specified task_group_id
        const parentTasks = await this.taskModel.findAll({
          where: { task_group_id: filters.task_group_id },
          attributes: ['id']
        });
        
        const parentTaskIds = parentTasks.map(t => t.id);
        ctx.log?.info({ task_group_id: filters.task_group_id, parentTaskIds }, "TaskRepository.findAll - found parent tasks");
        
        if (parentTaskIds.length > 0) {
          // Find all child tasks of these parent tasks (even if child doesn't have task_group_id)
          const childRelations = await this.taskParentModel.findAll({
            where: { parent_task_id: { [Op.in]: parentTaskIds } },
            attributes: ['child_task_id']
          });
          
          const childTaskIds = childRelations.map(rel => rel.child_task_id);
          ctx.log?.info({ childTaskIds }, "TaskRepository.findAll - found child tasks");
          
          // Combine parent and child task IDs
          taskIdsToInclude = [...new Set([...parentTaskIds, ...childTaskIds])];
          ctx.log?.info({ taskIdsToInclude }, "TaskRepository.findAll - all task IDs to include");
          
          // Use task IDs in where clause instead of task_group_id
          whereClause.id = { [Op.in]: taskIdsToInclude };
        } else {
          // No tasks found with this task_group_id, return empty result
          taskIdsToInclude = [];
          whereClause.id = { [Op.in]: [] }; // This will return no results
        }
      }
      
      if (filters.is_main_task !== undefined) {
        whereClause.is_main_task = filters.is_main_task;
      }
      if (filters.is_routine !== undefined) {
        whereClause.is_routine = filters.is_routine;
      }
      if (filters.non_routine_group_id) {
        whereClause.non_routine_group_id = filters.non_routine_group_id;
      }
      if (filters.role_id) {
        whereClause.role_id = filters.role_id;
      }
      if (filters.asset_id) {
        whereClause.asset_id = filters.asset_id;
      }
      if (filters.name) {
        whereClause.name = {
          [Op.iLike]: `%${filters.name}%`
        };
      }

      // Filter by parent_task_id - find all child tasks that have this parent
      if (filters.parent_task_id) {
        const childRelations = await this.taskParentModel.findAll({
          where: { parent_task_id: filters.parent_task_id },
          attributes: ['child_task_id']
        });
        const childTaskIds = childRelations.map(rel => rel.child_task_id);
        ctx.log?.info({ parent_task_id: filters.parent_task_id, childTaskIds }, "TaskRepository.findAll - found child tasks by parent");
        
        if (childTaskIds.length > 0) {
          // If we already have taskIdsToInclude from task_group_id filter, intersect them
          if (taskIdsToInclude !== null) {
            taskIdsToInclude = taskIdsToInclude.filter(id => childTaskIds.includes(id));
          } else {
            taskIdsToInclude = childTaskIds;
          }
          whereClause.id = { [Op.in]: taskIdsToInclude };
        } else {
          // No child tasks found, return empty result
          taskIdsToInclude = [];
          whereClause.id = { [Op.in]: [] };
        }
      }

      // Filter by child_task_id - find all parent tasks of this child
      if (filters.child_task_id) {
        const parentRelations = await this.taskParentModel.findAll({
          where: { child_task_id: filters.child_task_id },
          attributes: ['parent_task_id']
        });
        const parentTaskIds = parentRelations.map(rel => rel.parent_task_id);
        ctx.log?.info({ child_task_id: filters.child_task_id, parentTaskIds }, "TaskRepository.findAll - found parent tasks by child");
        
        if (parentTaskIds.length > 0) {
          // If we already have taskIdsToInclude from other filters, intersect them
          if (taskIdsToInclude !== null) {
            taskIdsToInclude = taskIdsToInclude.filter(id => parentTaskIds.includes(id));
          } else {
            taskIdsToInclude = parentTaskIds;
          }
          whereClause.id = { [Op.in]: taskIdsToInclude };
        } else {
          // No parent tasks found, return empty result
          taskIdsToInclude = [];
          whereClause.id = { [Op.in]: [] };
        }
      }

      const queryOptions = {
        where: whereClause,
        include: [
          {
            model: this.userModel,
            as: 'createdBy',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.roleModel,
            as: 'role',
            attributes: ['id', 'name', 'level']
          },
          {
            model: this.assetModel,
            as: 'asset',
            attributes: ['id', 'name', 'code']
          },
          {
            model: this.taskGroupModel,
            as: 'taskGroup',
            attributes: ['id', 'name', 'start_time', 'end_time', 'is_active'],
            required: false
          }
        ],
      };

      // Handle ordering - sama seperti asset
      let order;
      if (filters.order) {
        switch (filters.order) {
          case "oldest":
            order = [["updated_at", "ASC"]];
            break;
          case "newest":
            order = [["updated_at", "DESC"]];
            break;
          case "a-z":
            order = [["name", "ASC"]];
            break;
          case "z-a":
            order = [["name", "DESC"]];
            break;
          default:
            order = [["id", "ASC"]];
            break;
        }
        queryOptions.order = order;
      } else {
        queryOptions.order = [["id", "ASC"]];
      }

      // Add pagination if provided
      if (filters.limit) {
        queryOptions.limit = parseInt(filters.limit);
      }
      if (filters.offset) {
        queryOptions.offset = parseInt(filters.offset);
      }

      const { count, rows } = await this.taskModel.findAndCountAll(queryOptions);
      
      // Get parent task IDs for each task
      const tasks = await Promise.all(rows.map(async (task) => {
        const taskJson = task.toJSON ? task.toJSON() : task;
        
        // Get parent task IDs from junction table
        if (this.taskParentModel) {
          const parentRelations = await this.taskParentModel.findAll({
            where: { child_task_id: task.id },
            attributes: ['parent_task_id']
          });
          taskJson.parent_task_ids = parentRelations.map(rel => rel.parent_task_id);
        } else {
          taskJson.parent_task_ids = [];
        }
        
        return taskJson;
      }));

      // Calculate pagination metadata
      const limit = filters.limit ? parseInt(filters.limit) : null;
      const offset = filters.offset ? parseInt(filters.offset) : 0;
      const totalPages = limit ? Math.ceil(count / limit) : 1;
      const currentPage = limit ? Math.floor(offset / limit) + 1 : 1;

      return {
        tasks,
        total: count,
        limit: limit,
        offset: offset,
        totalPages: totalPages,
        currentPage: currentPage
      };
    } catch (error) {
      ctx.log?.error({ filters, error }, "TaskRepository.findAll_error");
      throw error;
    }
  }

  /**
   * All non-routine task definitions (for monthly user_task generation).
   */
  async findAllNonRoutineBare(ctx = {}, transaction = null) {
    try {
      ctx.log?.info({}, "TaskRepository.findAllNonRoutineBare");
      const rows = await this.taskModel.findAll({
        where: { is_routine: false },
        attributes: [
          "id",
          "name",
          "is_main_task",
          "monthly_frequency",
          "due_date",
          "area",
          "assigned_user_id",
          "non_routine_items",
        ],
        transaction,
      });
      return rows.map((r) => (r.toJSON ? r.toJSON() : r));
    } catch (error) {
      ctx.log?.error({ error }, "TaskRepository.findAllNonRoutineBare_error");
      throw error;
    }
  }

  async delete(id, ctx = {}, transaction = null) {
    try {
      ctx.log?.info({ id }, "TaskRepository.delete");
      const deleted = await this.taskModel.destroy({
        where: { id },
        transaction
      });
      return deleted > 0;
    } catch (error) {
      ctx.log?.error({ id, error }, "TaskRepository.delete_error");
      throw error;
    }
  }
  
  // async getNearestTask(ctx) {
  //   try {
  //     ctx.log?.info()
  //   } catch (error) {
      
  //   }
  // }
}

module.exports = TaskRepository;