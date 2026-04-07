const { Op } = require("sequelize");
const sequelize = require("../models/sequelize");
const { UnitStatusStrToInt, UnitStatusIntToStr } = require('../models/Unit');

class UnitRepository {
  constructor(unitModel, assetModel, userModel) {
    this.assetModel = assetModel;
    this.userModel = userModel;
    this.unitModel = unitModel;
  }

  async create(unitData, ctx, tx = null) {
    ctx.log?.info({ name: unitData.name }, "UnitRepository.create");
    const {
      name,
      asset_id,
      size,
      building_area,
      electrical_power,
      electrical_unit,
      is_toilet_exist,
      description,
      is_deleted,
      status,
    } = unitData;
    
    // Convert status from string to integer if provided
    let statusInt = status;
    if (status && typeof status === 'string') {
      const { UnitStatusStrToInt } = require('../models/Unit');
      statusInt = UnitStatusStrToInt[status];
      if (statusInt === undefined) {
        throw new Error(`Invalid status: ${status}. Must be 'available', 'occupied', 'maintenance', 'reserved', 'inactive', or 'out_of_order'`);
      }
    }
    
    const unit = await this.unitModel.create(
      {
        name,
        asset_id,
        size,
        building_area,
        electrical_power,
        electrical_unit,
        is_toilet_exist,
        description,
        is_deleted,
        status: statusInt !== undefined ? statusInt : 0, // Default to 0 (available) if not provided
        created_by: ctx.userId,
      },
      { transaction: tx }
    );

    return unit.toJSON();
  }

  async findById(id) {
    const unit = await this.unitModel.findByPk(id, {
      include: [
        {
          model: this.assetModel,
          as: "asset",
          attributes: ["id", "name"],
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
    const result = unit ? unit.toJSON() : null;
    if (result) {
      // Convert status from integer to string
      const { UnitStatusIntToStr } = require('../models/Unit');
      if (result.status !== undefined && result.status !== null) {
        result.status = UnitStatusIntToStr[result.status] || result.status;
      }
      
      result.created_by = result.createdBy;
      result.updated_by = result.updatedBy;
      result.asset = result.asset;
      delete result.createdBy;
      delete result.updatedBy;
      delete result.asset_id;
    }
    return result;
  }

  async findAll(filter = {}, ctx) {
    ctx.log?.info({}, "UnitRepository.findAll");
    let whereQuery = {};
    
    // Always filter out deleted units unless explicitly requested
    if (filter.is_deleted === undefined) {
      filter.is_deleted = false;
    }
    
    if (filter.asset_id || filter.name || filter.is_toilet_exist || filter.status || filter.is_deleted !== undefined) {
      whereQuery.where = {};
      if (filter.asset_id) {
        whereQuery.where.asset_id = filter.asset_id;
      }

      if (filter.name) {
        const nameParam = filter.name.toLowerCase();
        whereQuery.where.name = {
          [Op.iLike]: `%${nameParam}%`,
        };
      }

      if (filter.is_toilet_exist !== undefined) {
        whereQuery.where.is_toilet_exist = filter.is_toilet_exist;
      }

      if (filter.is_deleted !== undefined) {
        whereQuery.where.is_deleted = filter.is_deleted;
      }

      // Add status filter if provided
      if (filter.status !== undefined && filter.status !== null && filter.status !== '') {
        // Convert string status to integer if needed
        let statusInt = filter.status;
        if (typeof filter.status === 'string') {
          statusInt = UnitStatusStrToInt[filter.status];
          if (statusInt === undefined) {
            // If string doesn't match, try parsing as integer
            statusInt = parseInt(filter.status, 10);
            if (isNaN(statusInt)) {
              throw new Error(`Invalid status: ${filter.status}. Must be 'available', 'occupied', 'maintenance', 'reserved', 'inactive', 'out_of_order', or 0, 1, 2, 3, 4, 5`);
            }
          }
        }
        whereQuery.where.status = statusInt;
      }
    }

    if (filter.limit) {
      whereQuery.limit = parseInt(filter.limit);
    }

    if (filter.offset) {
      whereQuery.offset = parseInt(filter.offset);
    }

    if (filter.order) {
      let order;
      switch (filter.order) {
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
          break;
      }

      whereQuery.order = order;
    }

    whereQuery.include = [
      {
        model: this.assetModel,
        as: "asset",
        attributes: ["id", "name"],
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
    const data = await this.unitModel.findAndCountAll(whereQuery);
    const result = {
      units: data.rows.map((u) => {
        const unit = u.toJSON();
        
        // Convert status from integer to string
        if (unit.status !== undefined && unit.status !== null) {
          unit.status = UnitStatusIntToStr[unit.status] || unit.status;
        }
        
        unit.created_by = u.createdBy;
        unit.updated_by = u.updatedBy;
        unit.asset = u.asset;
        delete unit.asset_id;
        delete unit.createdBy;
        delete unit.updatedBy;

        return unit;
      }),
      total: data.count,
    };
    return result;
  }

  async update(id, updateData, ctx = {}) {
    ctx.log?.info({ unit_id: id, updateData }, "UnitRepository.update");
    const unit = await this.unitModel.findByPk(id);
    if (!unit) {
      ctx.log?.warn({ unit_id: id }, "UnitRepository.update - unit not found");
      return null;
    }
    
    // Convert status from string to integer if provided
    const data = { ...updateData };
    if (data.status !== undefined && data.status !== null) {
      if (typeof data.status === 'string') {
        data.status = UnitStatusStrToInt[data.status];
        if (data.status === undefined) {
          throw new Error(`Invalid status: ${updateData.status}. Must be 'available', 'occupied', 'maintenance', 'reserved', 'inactive', or 'out_of_order'`);
        }
      }
      // If status is already an integer, use it directly
    }
    
    // Remove created_at from update data to prevent it from being changed
    delete data.created_at;
    
    // Always update updated_at to current timestamp
    data.updated_at = new Date();
    
    ctx.log?.info({ unit_id: id, data_to_update: data, transaction: !!ctx.transaction }, "UnitRepository.update - calling unit.update");
    const updatedUnit = await unit.update(data, { transaction: ctx.transaction });
    
    // Convert status back to string for response
    if (updatedUnit) {
      const { UnitStatusIntToStr } = require('../models/Unit');
      const unitJson = updatedUnit.toJSON();
      if (unitJson.status !== undefined && unitJson.status !== null) {
        unitJson.status = UnitStatusIntToStr[unitJson.status] || unitJson.status;
      }
      return unitJson;
    }
    
    return updatedUnit;
  }

  async delete(id) {
    const unit = await this.unitModel.findByPk(id);
    if (!unit) return null;
    await unit.destroy();
    return unit;
  }

  async countByAssetIds(assetIds, ctx = {}) {
    ctx.log?.debug({ assetIds }, "UnitRepository.countByAssetIds");
    if (!assetIds || assetIds.length === 0) {
      return {};
    }

    const unitCounts = await this.unitModel.findAll({
      attributes: [
        'asset_id',
        [sequelize.fn('COUNT', sequelize.literal('*')), 'total_units']
      ],
      where: {
        asset_id: assetIds,
        is_deleted: false
      },
      group: ['asset_id'],
      raw: true
    });

    // Create a map of asset_id to unit count
    const unitCountMap = {};
    unitCounts.forEach(count => {
      unitCountMap[count.asset_id] = parseInt(count.total_units);
    });

    return unitCountMap;
  }
}

module.exports = UnitRepository;
