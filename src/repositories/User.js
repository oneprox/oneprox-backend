const { Op } = require("sequelize");
const sequelize = require("../models/sequelize");
const { UserGenderStrToInt, UserStatusStrToInt } = require("../models/User");

class UserRepository {
  constructor(userModel, roleModel) {
    this.userModel = userModel;
    this.roleModel = roleModel;
  }

  async findByEmail(email, ctx = {}) {
    ctx.log?.debug({ email }, "repo_find_user_by_email");
    const user = await this.userModel.findOne({
      where: { email },
    });
    return user ? user.toJSON() : null;
  }

  async findById(id, ctx = {}) {
    ctx.log?.debug({ id, type: typeof id }, "repo_find_user_by_id");
    
    // Pastikan ID adalah UUID string
    const userId = id;
    if (!userId || typeof userId !== 'string') {
      ctx.log?.warn({ id }, "repo_find_user_by_id_invalid_id");
      return null;
    }
    
    try {
      const user = await this.userModel.findByPk(userId, {
        include: [
          {
            model: this.roleModel,
            as: "role",
            attributes: ["id", "name", "level"],
          },
          {
            model: this.userModel,
            as: "createdBy",
            attributes: ["id", "name", "email"],
          },
          {
            model: this.userModel,
            as: "updatedBy",
            attributes: ["id", "name", "email"],
          },
        ],
      });
      
      if (!user) {
        ctx.log?.warn({ userId }, "repo_find_user_by_id_not_found");
        return null;
      }
      
      ctx.log?.debug({ userId, found: true }, "repo_find_user_by_id_success");
      return user.toJSON();
    } catch (error) {
      ctx.log?.error({ error: error.message, userId }, "repo_find_user_by_id_error");
      // Fallback: get user and role separately, then join manually
      try {
        const user = await this.userModel.findByPk(userId);
        if (!user) {
          ctx.log?.warn({ userId }, "repo_find_user_by_id_fallback_not_found");
          return null;
        }

        const userData = user.toJSON();

        const RoleModel = this.roleModel;
        if (RoleModel && userData.role_id) {
          const role = await RoleModel.findByPk(userData.role_id, {
            attributes: ["id", "name", "level"],
          });
          if (role) {
            userData.role = role.toJSON();
          }
        }

        ctx.log?.debug({ userId, found: true }, "repo_find_user_by_id_fallback_success");
        return userData;
      } catch (fallbackError) {
        ctx.log?.error(
          { error: fallbackError.message, userId },
          "repo_find_user_by_id_fallback_error"
        );
        return null;
      }
    }
  }

  async create(
    { email, password, name, phone, gender, roleId, status, createdBy },
    ctx = {}
  ) {
    ctx.log?.info({ email }, "repo_create_user");
    const user = await this.userModel.create({
      email,
      password,
      name,
      phone,
      gender,
      role_id: roleId,
      status: status || 1,
      created_by: createdBy,
    });
    return user.toJSON();
  }

  async updatePassword(userId, password, ctx = {}) {
    ctx.log?.info({ userId }, "repo_update_password");
    const user = await this.userModel.findByPk(userId);
    if (!user) return null;
    await user.update({ password, updated_at: new Date(), updated_by: userId });
    return user.toJSON();
  }

  async listAll(filters, ctx = {}) {
    ctx.log?.info({}, "repo_list_all_users");
    let whereQuery = {};
    if (
      filters.name ||
      filters.status ||
      filters.email ||
      filters.gender ||
      filters.phone ||
      filters.role_id
    ) {
      whereQuery.where = {};
      if (filters.name) {
        let filterName = filters.name.toLowerCase();
        whereQuery.where.name = {
          [Op.like]: `%${filterName}%`,
        };
      }

      if (filters.status) {
        whereQuery.where.status = UserStatusStrToInt[filters.status];
      }

      if (filters.email) {
        whereQuery.where.email = filters.email;
      }

      if (filters.gender) {
        whereQuery.where.gender = UserGenderStrToInt[filters.gender];
      }

      if (filters.phone) {
        whereQuery.where.phone = filters.phone;
      }

      if (filters.role_id) {
        whereQuery.where.role_id = filters.role_id;
      }
    }

    if (filters.limit) {
      whereQuery.limit = parseInt(filters.limit);
    }

    if (filters.offset) {
      whereQuery.offset = parseInt(filters.offset);
    }

    whereQuery.include = [
      {
        model: this.roleModel,
        as: "role",
        attributes: ["id", "name", "level"],
      },
      {
        model: this.userModel,
        as: "createdBy",
        attributes: ["id", "name", "email"],
      },
      {
        model: this.userModel,
        as: "updatedBy",
        attributes: ["id", "name", "email"],
      },
    ];

    if (filters.asset_id) {
      whereQuery.include.push({
        model: this.userModel.sequelize.models.UserAsset,
        as: "userAssets",
        attributes: [],
        required: true,
        where: {
          asset_id: filters.asset_id,
        },
      });
    }
    
    // Set order after includes to ensure proper column resolution
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
          // Use simple column name - Sequelize resolves it to the main model when no ambiguity
          // For case-insensitive, we'll sort in JavaScript after fetching, or use a subquery approach
          // For now, use simple sort and handle case-insensitive in the usecase
          order = [['name', 'ASC']];
          break;
        case "z-a":
          // Use simple column name - Sequelize resolves it to the main model when no ambiguity
          order = [['name', 'DESC']];
          break;
        default:
          break;
      }

      whereQuery.order = order;
    } else {
      // Default to newest if no order is specified
      whereQuery.order = [["updated_at", "DESC"]];
    }
    
    try {
      const users = await this.userModel.findAndCountAll(whereQuery);
      return {
        users: users.rows.map((u) => u.toJSON()),
        total: users.count,
      };
    } catch (error) {
      ctx.log?.error({ error: error.message }, "repo_list_all_users_error");
      // Fallback: get users and roles separately, then join manually
      try {
        delete whereQuery.include;
        const users = await this.userModel.findAndCountAll(whereQuery);

        const RoleModel = this.userModel.sequelize.models.Role;
        if (RoleModel) {
          const roles = await RoleModel.findAll({
            attributes: ["id", "name", "level"],
          });

          // Create a map of roles for quick lookup
          const roleMap = new Map();
          roles.forEach((role) => {
            roleMap.set(role.id, role.toJSON());
          });

          // Add role information to users
          return {
            users: users.rows.map((user) => {
              const userData = user.toJSON();
              const role = roleMap.get(userData.role_id);
              if (role) {
                userData.role = role;
              }
              return userData;
            }),
            total: users.count,
          };
        }

        return {
          users: users.rows.map((u) => u.toJSON()),
          total: users.count,
        };
      } catch (fallbackError) {
        ctx.log?.error(
          { error: fallbackError.message },
          "repo_list_all_users_fallback_error"
        );
        return { users: [], total: 0 };
      }
    }
  }

  async update(id, userData, ctx = {}) {
    ctx.log?.info({ id, type: typeof id }, "repo_update_user");
    
    // Pastikan ID adalah UUID string
    const userId = id;
    if (!userId || typeof userId !== 'string') {
      ctx.log?.warn({ id }, "repo_update_user_invalid_id");
      return null;
    }
    
    const user = await this.userModel.findByPk(userId);
    if (!user) {
      ctx.log?.warn({ userId }, "repo_update_user_not_found");
      return null;
    }
    
    try {
      // Build update object with only provided fields
      const updateFields = {
        updated_at: new Date(),
      };
      
      // Only include fields that are explicitly provided in userData
      if (userData.email !== undefined && userData.email !== null && userData.email !== '') {
        updateFields.email = userData.email;
        ctx.log?.info({ userId, email: userData.email }, "repo_update_user - including email in update");
      } else if (userData.email !== undefined) {
        ctx.log?.warn({ userId, email: userData.email }, "repo_update_user - email is undefined/null/empty, skipping");
      }
      if (userData.password !== undefined) {
        updateFields.password = userData.password;
      }
      if (userData.name !== undefined) {
        updateFields.name = userData.name;
      }
      if (userData.roleId !== undefined) {
        updateFields.role_id = userData.roleId;
      }
      if (userData.gender !== undefined) {
        updateFields.gender = userData.gender;
      }
      if (userData.phone !== undefined) {
        updateFields.phone = userData.phone;
      }
      if (userData.status !== undefined) {
        updateFields.status = userData.status;
      }
      if (userData.updatedBy !== undefined) {
        updateFields.updated_by = userData.updatedBy;
      }
      
      await user.update(updateFields);
      
      // Reload the user to get fresh data from database
      await user.reload();
      
      ctx.log?.debug({ userId, updateFields, updatedEmail: user.email }, "repo_update_user_success");
      return user.toJSON();
    } catch (error) {
      ctx.log?.error({ error: error.message, userId }, "repo_update_user_error");
      throw error;
    }
  }

  async delete(id, ctx = {}) {
    ctx.log?.info({ id, type: typeof id }, "repo_delete_user");
    
    // Pastikan ID adalah UUID string
    const userId = id;
    if (!userId || typeof userId !== 'string') {
      ctx.log?.warn({ id }, "repo_delete_user_invalid_id");
      return false;
    }
    
    try {
      const deleted = await this.userModel.destroy({ where: { id: userId } });
      ctx.log?.debug({ userId, deleted }, "repo_delete_user_result");
      return deleted > 0;
    } catch (error) {
      ctx.log?.error({ error: error.message, userId }, "repo_delete_user_error");
      throw error;
    }
  }

  async getUserPermissions(userId, ctx = {}) {
    ctx.log?.info({ userId }, "repo_get_user_permissions");
    const user = await this.userModel.findByPk(userId, {
      include: [
        {
          model: this.userModel.sequelize.models.Role,
          as: "role",
          include: [
            {
              model: this.userModel.sequelize.models.RoleMenuPermission,
              as: "menuPermissions",
              include: [
                {
                  model: this.userModel.sequelize.models.Menu,
                  as: "menu",
                  attributes: [
                    "id",
                    "title",
                    "url",
                    "icon",
                    "parent_id",
                    "order",
                    "is_active",
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!user || !user.role) {
      return [];
    }

    // Extract permissions from role
    const permissions =
      user.role.menuPermissions?.map((perm) => ({
        menu_id: perm.menu.id,
        can_view: perm.can_view,
        can_create: perm.can_create,
        can_update: perm.can_update,
        can_delete: perm.can_delete,
        can_confirm: perm.can_confirm,
      })) || [];

    return permissions;
  }

  async getUserSidebar(userId, ctx = {}) {
    ctx.log?.info({ userId }, "repo_get_user_sidebar");
    const user = await this.userModel.findByPk(userId, {
      include: [
        {
          model: this.userModel.sequelize.models.Role,
          as: "role",
          include: [
            {
              model: this.userModel.sequelize.models.RoleMenuPermission,
              as: "menuPermissions",
            },
          ],
        },
      ],
    });

    if (!user || !user.role) {
      return [];
    }

    // Extract permissions from role
    const permissions =
      user.role.menuPermissions?.map((perm) => ({
        menu_id: perm.menu.id,
        can_view: perm.can_view,
        can_create: perm.can_create,
        can_update: perm.can_update,
        can_delete: perm.can_delete,
        can_confirm: perm.can_confirm,
      })) || [];

    return permissions;
  }
}

module.exports = UserRepository;
