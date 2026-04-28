const AttendanceModel = require('../models/Attendance');

class AttendanceRepository {
  constructor() {
    this.attendanceModel = AttendanceModel;
  }

  async create(data, transaction = null) {
    const options = transaction ? { transaction } : {};
    return await this.attendanceModel.create(data, options);
  }

  async findById(id) {
    return await this.attendanceModel.findByPk(id);
  }

  async findTodayAttendance(userId, assetId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await this.attendanceModel.findOne({
      where: {
        user_id: userId,
        asset_id: assetId,
        created_at: {
          [require('sequelize').Op.gte]: today,
          [require('sequelize').Op.lt]: tomorrow
        }
      },
      order: [['created_at', 'DESC']]
    });
  }

  async findTodayCheckIn(userId, assetId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await this.attendanceModel.findOne({
      where: {
        user_id: userId,
        asset_id: assetId,
        status: 'checked_in',
        created_at: {
          [require('sequelize').Op.gte]: today,
          [require('sequelize').Op.lt]: tomorrow
        }
      },
      order: [['created_at', 'DESC']]
    });
  }

  async update(id, data, transaction = null) {
    const options = { where: { id } };
    if (transaction) options.transaction = transaction;
    
    return await this.attendanceModel.update(data, options);
  }

  async getUserAttendanceHistory(userId, limit = 10, offset = 0, dateFrom = null, dateTo = null) {
    const { Op } = require('sequelize');
    const whereClause = { user_id: userId };

    // Add date range filter if provided
    if (dateFrom || dateTo) {
      whereClause.created_at = {};
      if (dateFrom) {
        // Start of the day for date_from
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        whereClause.created_at[Op.gte] = fromDate;
      }
      if (dateTo) {
        // End of the day for date_to
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        whereClause.created_at[Op.lte] = toDate;
      }
    }

    return await this.attendanceModel.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
  }

  async getAssetAttendanceHistory(assetId, limit = 10, dateFrom = null, dateTo = null) {
    const { Op } = require('sequelize');
    const whereClause = { asset_id: assetId };

    // Add date range filter if provided
    if (dateFrom || dateTo) {
      whereClause.created_at = {};
      if (dateFrom) {
        // Start of the day for date_from
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        whereClause.created_at[Op.gte] = fromDate;
      }
      if (dateTo) {
        // End of the day for date_to
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        whereClause.created_at[Op.lte] = toDate;
      }
    }

    return await this.attendanceModel.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit
    });
  }
}

module.exports = AttendanceRepository;