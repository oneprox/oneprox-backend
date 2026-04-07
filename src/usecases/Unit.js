const sequelize = require("../models/sequelize");
const { transformImageUrls } = require('../services/baseUrl');

class UnitUsecase {
  constructor(unitRepository, unitAttachmentRepository, unitLogRepository) {
    this.unitRepository = unitRepository;
    this.unitAttachmentRepository = unitAttachmentRepository;
    this.unitLogRepository = unitLogRepository;
  }

  async createUnit(data, ctx) {
    ctx.log?.info({ data }, "UnitUsecase.create");
    // Business logic for creating a unit
    const result = await sequelize.transaction(async (t) => {
      const unit = await this.unitRepository.create(data, ctx, t);
      if (unit && data.photos) {
        for (let i = 0; i < data.photos.length; i++) {
          let createAttachmentData = {
            unit_id: unit.id,
            url: data.photos[i],
          };

          await this.unitAttachmentRepository.create(
            createAttachmentData,
            ctx,
            t
          );
        }
      }

      // Create log entry - only store essential data
      const unitLog = {
        unit_id: unit.id,
        action: 'CREATE',
        old_data: null,
        new_data: {
          name: unit.name,
          size: unit.size,
          building_area: unit.building_area,
        },
        created_by: ctx.userId,
      };
      await this.unitLogRepository.create(unitLog, { ...ctx, transaction: t });

      return unit;
    });

    return result;
  }

  async getAllUnits(filters, ctx) {
    // Business logic for retrieving all units
    return this.unitRepository.findAll(filters, ctx);
  }

  async getUnitById(id, ctx) {
    // Business logic for retrieving a unit by ID
    const unit = await this.unitRepository.findById(id);
    if (!unit) {
      throw new Error("Unit not found");
    }

    const attachments = await this.unitAttachmentRepository.getByUnitID(
      unit.id
    );
    let photos = [];
    if (attachments.length > 0) {
      for (let i = 0; i < attachments.length; i++) {
        photos.push(attachments[i].url);
      }
    }
    unit.photos = transformImageUrls(photos);
    return unit;
  }

  async updateUnit(id, data, ctx) {
    // Business logic for updating a unit
    const unit = await this.unitRepository.findById(id);
    if (!unit) {
      throw new Error("Unit not found");
    }
    const updatedData = {
      asset_id: data.asset_id ?? unit.asset?.id,
      name: data.name ?? unit.name,
      size: data.size ?? unit.size,
      building_area: data.building_area ?? unit.building_area,
      electrical_power: data.electrical_power ?? unit.electrical_power,
      electrical_unit: data.electrical_unit ?? unit.electrical_unit,
      is_toilet_exist: data.is_toilet_exist ?? unit.is_toilet_exist,
      description: data.description ?? unit.description,
      is_deleted: data.is_deleted ?? unit.is_deleted,
      status: data.status ?? unit.status,
      updated_by: ctx.userId
    };
    const updatedUnit = await this.unitRepository.update(id, updatedData, ctx);
    if (updatedUnit) {
      console.log('aman update unit')
      // Create log entry - only store changed data
      const oldData = {};
      const newData = {};
      
      // Debug logging
      ctx.log?.info({
        unit_id: unit.id,
        data_received: data,
        current_unit: {
          name: unit.name,
          size: unit.size,
          electrical_power: unit.electrical_power,
          electrical_unit: unit.electrical_unit,
          is_toilet_exist: unit.is_toilet_exist,
          is_deleted: unit.is_deleted
        }
      }, "UnitUsecase.updateUnit_debug");
      
      // Check which fields actually changed
      if (data.name !== undefined && data.name !== unit.name) {
        oldData.name = unit.name;
        newData.name = data.name;
      }
      if (data.size !== undefined && data.size !== unit.size) {
        oldData.size = unit.size;
        newData.size = data.size;
      }
      if (data.building_area !== undefined && data.building_area !== unit.building_area) {
        oldData.building_area = unit.building_area;
        newData.building_area = data.building_area;
      }
      if (data.description !== undefined && data.description !== unit.description) {
        oldData.description = unit.description;
        newData.description = data.description;
      }
      if (data.electrical_power !== undefined && data.electrical_power !== unit.electrical_power) {
        oldData.electrical_power = unit.electrical_power;
        newData.electrical_power = data.electrical_power;
      }
      if (data.electrical_unit && data.electrical_unit !== unit.electrical_unit) {
        oldData.electrical_unit = unit.electrical_unit;
        newData.electrical_unit = data.electrical_unit;
      }
      if (data.is_toilet_exist !== undefined && data.is_toilet_exist !== unit.is_toilet_exist) {
        oldData.is_toilet_exist = unit.is_toilet_exist;
        newData.is_toilet_exist = data.is_toilet_exist;
      }
      if (data.is_deleted !== undefined && data.is_deleted !== unit.is_deleted) {
        oldData.is_deleted = unit.is_deleted;
        newData.is_deleted = data.is_deleted;
      }
      if (data.status !== undefined && data.status !== unit.status) {
        const { UnitStatusIntToStr } = require("../models/Unit");
        oldData.status = UnitStatusIntToStr[unit.status] || unit.status;
        newData.status = data.status;
      }

      // Debug logging for comparison results
      ctx.log?.info({
        unit_id: unit.id,
        oldData,
        newData,
        hasChanges: Object.keys(oldData).length > 0
      }, "UnitUsecase.updateUnit_comparison");

      // Only create log if there are actual changes
      if (Object.keys(oldData).length > 0) {
        const unitLog = {
          unit_id: updatedUnit.id,
          action: 'UPDATE',
          old_data: oldData,
          new_data: newData,
          created_by: ctx.userId,
        };

        await this.unitLogRepository.create(unitLog, ctx);
      }
    }

    return updatedUnit;
  }

  async deleteUnit(id, ctx) {
    // Business logic for deleting a unit
    const unit = await this.unitRepository.findById(id);
    if (!unit) {
      throw new Error("Unit not found");
    }
    
    // Create log entry before deletion
    const unitLog = {
      unit_id: unit.id,
      action: 'DELETE',
      old_data: {
        name: unit.name,
        size: unit.size,
      },
      new_data: null,
      created_by: ctx.userId,
    };
    
    await this.unitLogRepository.create(unitLog, ctx);
    
    return this.unitRepository.delete(id);
  }

  async getUnitLogs(id, ctx) {
    const unitLogs = await this.unitLogRepository.findByUnitID(id, ctx);

    return unitLogs;
  }
}

module.exports = UnitUsecase;
