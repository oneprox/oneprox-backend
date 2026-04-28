const AttendanceRepository = require('../repositories/Attendance');

class AttendanceUseCase {
  constructor() {
    this.attendanceRepository = new AttendanceRepository();
  }

  async checkIn(userId, assetId, latitude, longitude, notes = null) {
    try {
      // Check if user already checked in today
      const existingCheckIn = await this.attendanceRepository.findTodayCheckIn(userId, assetId);
      
      if (existingCheckIn) {
        return {
          success: false,
          message: 'Anda sudah melakukan check-in hari ini',
          data: existingCheckIn
        };
      }

      // Create new check-in record
      const attendanceData = {
        user_id: userId,
        asset_id: assetId,
        check_in_time: new Date(),
        check_in_latitude: latitude,
        check_in_longitude: longitude,
        status: 'checked_in',
        notes: notes
      };

      const attendance = await this.attendanceRepository.create(attendanceData);
      
      return {
        success: true,
        message: 'Check-in berhasil',
        data: attendance
      };
    } catch (error) {
      console.error('Check-in error:', error);
      return {
        success: false,
        message: 'Gagal melakukan check-in',
        error: error.message
      };
    }
  }

  async checkOut(userId, assetId, latitude, longitude, notes = null) {
    try {
      // Find today's check-in record
      const checkInRecord = await this.attendanceRepository.findTodayCheckIn(userId, assetId);
      
      if (!checkInRecord) {
        return {
          success: false,
          message: 'Anda belum melakukan check-in hari ini',
          data: null
        };
      }

      // Update with check-out information
      const updateData = {
        check_out_time: new Date(),
        check_out_latitude: latitude,
        check_out_longitude: longitude,
        status: 'checked_out',
        notes: notes || checkInRecord.notes
      };

      await this.attendanceRepository.update(checkInRecord.id, updateData);
      
      // Get updated record
      const updatedRecord = await this.attendanceRepository.findById(checkInRecord.id);
      
      return {
        success: true,
        message: 'Check-out berhasil',
        data: updatedRecord
      };
    } catch (error) {
      console.error('Check-out error:', error);
      return {
        success: false,
        message: 'Gagal melakukan check-out',
        error: error.message
      };
    }
  }

  async getTodayStatus(userId, assetId) {
    try {
      const todayAttendance = await this.attendanceRepository.findTodayAttendance(userId, assetId);
      
      if (!todayAttendance) {
        return {
          success: true,
          data: {
            hasCheckedIn: false,
            hasCheckedOut: false,
            status: 'not_checked_in',
            attendance: null
          }
        };
      }

      return {
        success: true,
        data: {
          hasCheckedIn: !!todayAttendance.check_in_time,
          hasCheckedOut: !!todayAttendance.check_out_time,
          status: todayAttendance.status,
          attendance: todayAttendance
        }
      };
    } catch (error) {
      console.error('Get today status error:', error);
      return {
        success: false,
        message: 'Gagal mendapatkan status absensi',
        error: error.message
      };
    }
  }

  async getUserAttendanceHistory(userId, limit = 10, offset = 0, dateFrom = null, dateTo = null) {
    try {
      const historyResult = await this.attendanceRepository.getUserAttendanceHistory(
        userId,
        limit,
        offset,
        dateFrom,
        dateTo
      );
      
      return {
        success: true,
        data: {
          data: Array.isArray(historyResult?.rows) ? historyResult.rows : [],
          total: Number.isFinite(historyResult?.count) ? historyResult.count : 0,
          limit,
          offset,
        }
      };
    } catch (error) {
      console.error('Get user attendance history error:', error);
      return {
        success: false,
        message: 'Gagal mendapatkan riwayat absensi',
        error: error.message
      };
    }
  }

  async getAssetAttendanceHistory(assetId, limit = 10, dateFrom = null, dateTo = null) {
    try {
      const history = await this.attendanceRepository.getAssetAttendanceHistory(assetId, limit, dateFrom, dateTo);
      
      return {
        success: true,
        data: history
      };
    } catch (error) {
      console.error('Get asset attendance history error:', error);
      return {
        success: false,
        message: 'Gagal mendapatkan riwayat absensi asset',
        error: error.message
      };
    }
  }
}

module.exports = AttendanceUseCase;
