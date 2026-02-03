const sequelize = require('../models/sequelize');
const { Op } = require('sequelize');
const {
  ComplaintReportStatusIntToStr,
} = require('../models/ComplaintReport');
const { TaskTypeIntToStr } = require('../models/Task');

class DashboardUsecase {
  constructor(
    complaintReportRepository,
    tenantRepository,
    userRepository,
    userTaskRepository,
    attendanceRepository,
    tenantUnitRepository,
    unitRepository,
    assetRepository
  ) {
    this.complaintReportRepository = complaintReportRepository;
    this.tenantRepository = tenantRepository;
    this.userRepository = userRepository;
    this.userTaskRepository = userTaskRepository;
    this.attendanceRepository = attendanceRepository;
    this.tenantUnitRepository = tenantUnitRepository;
    this.unitRepository = unitRepository;
    this.assetRepository = assetRepository;
  }

  async getDashboardStats(ctx) {
    try {
      ctx.log?.info({}, 'DashboardUsecase.getDashboardStats');

      // Get total assets count
      const allAssets = await this.assetRepository.listAll({}, ctx);
      const totalAssets = allAssets?.total ?? (allAssets?.assets?.length ?? 0);
      ctx.log?.info({ 
        totalAssets, 
        assetsCount: allAssets?.assets?.length, 
        assetsResponse: JSON.stringify(allAssets) 
      }, 'DashboardUsecase.getDashboardStats - Assets');

      // Get total units count (not deleted) - filter is_deleted is handled in repository
      const allUnits = await this.unitRepository.findAll({}, ctx);
      const totalUnits = allUnits?.total ?? (allUnits?.units?.length ?? 0);
      ctx.log?.info({ 
        totalUnits, 
        unitsCount: allUnits?.units?.length, 
        unitsResponse: JSON.stringify(allUnits) 
      }, 'DashboardUsecase.getDashboardStats - Units');

      // Get total tenants count
      const allTenants = await this.tenantRepository.findAll({}, ctx);
      const totalTenants = allTenants?.total ?? (allTenants?.tenants?.length ?? 0);
      ctx.log?.info({ 
        totalTenants, 
        tenantsCount: allTenants?.tenants?.length, 
        tenantsResponse: JSON.stringify(allTenants) 
      }, 'DashboardUsecase.getDashboardStats - Tenants');

      // Calculate total revenue from active tenants
      // Revenue = sum of rent_price from active tenants
      let totalRevenue = 0;
      if (allTenants?.tenants && allTenants.tenants.length > 0) {
        const activeTenants = allTenants.tenants.filter(tenant => {
          // Handle Sequelize model instances
          const tenantData = tenant.toJSON ? tenant.toJSON() : tenant;
          return tenantData.status === 1; // active status
        });
        
        totalRevenue = activeTenants.reduce((sum, tenant) => {
          // Handle Sequelize model instances
          const tenantData = tenant.toJSON ? tenant.toJSON() : tenant;
          const rentPrice = parseFloat(tenantData.rent_price) || 0;
          ctx.log?.info({ 
            tenantId: tenantData.id, 
            tenantName: tenantData.name, 
            rentPrice,
            rentPriceType: typeof tenantData.rent_price 
          }, 'DashboardUsecase.getDashboardStats - Tenant Revenue');
          return sum + rentPrice;
        }, 0);
      }
      ctx.log?.info({ totalRevenue, tenantCount: allTenants?.tenants?.length || 0 }, 'DashboardUsecase.getDashboardStats - Revenue');

      // Calculate percentage change (simplified - comparing with previous period)
      // For now, we'll use placeholder values
      const revenueChange = '+2% vs last year';
      const assetChange = '+2% vs last year';
      const unitChange = '+2% vs last year';
      const tenantChange = '-2% vs last year';

      return {
        totalRevenue: {
          value: totalRevenue,
          formatted: new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(totalRevenue),
          change: revenueChange,
          changeType: 'positive',
        },
        totalAssets: {
          value: totalAssets,
          formatted: totalAssets.toString(),
          change: assetChange,
          changeType: 'positive',
        },
        totalUnits: {
          value: totalUnits,
          formatted: totalUnits.toString(),
          change: unitChange,
          changeType: 'positive',
        },
        totalTenants: {
          value: totalTenants,
          formatted: totalTenants.toString(),
          change: tenantChange,
          changeType: 'negative',
        },
      };
    } catch (error) {
      ctx.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardUsecase.getDashboardStats_error'
      );
      throw error;
    }
  }

  async getDashboardData(ctx) {
    try {
      ctx.log?.info({}, 'DashboardUsecase.getDashboardData');

      // Get recent complaints (limit 5)
      const recentComplaints = await this.complaintReportRepository.findAll(
        { limit: 5, offset: 0 },
        ctx
      );

      // Get complaint statistics for chart
      const allComplaints = await this.complaintReportRepository.findAll(
        {},
        ctx
      );

      // Calculate complaint stats
      const complaintStats = {
        total: allComplaints.total || 0,
        pending: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
      };

      (allComplaints.complaintReports || []).forEach((cr) => {
        if (!cr) return;
        const status = ComplaintReportStatusIntToStr[cr.status] || 'pending';
        if (status === 'pending') {
          complaintStats.pending++;
        } else if (status === 'in_progress') {
          complaintStats.in_progress++;
        } else if (status === 'resolved') {
          complaintStats.resolved++;
        } else if (status === 'closed') {
          complaintStats.closed++;
        }
      });

      // Get expiring tenant contracts (contracts ending within 6 months)
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      const now = new Date();

      const allTenants = await this.tenantRepository.findAll({}, ctx);
      const expiringTenants = (allTenants.tenants || [])
        .filter((tenant) => {
          if (!tenant || !tenant.contract_end_at) return false;
          try {
            const endDate = new Date(tenant.contract_end_at);
            return endDate >= now && endDate <= sixMonthsFromNow;
          } catch (error) {
            ctx.log?.warn({ tenant_id: tenant?.id, error: error.message }, 'Failed to parse contract_end_at');
            return false;
          }
        })
        .sort((a, b) => {
          try {
            return new Date(a.contract_end_at) - new Date(b.contract_end_at);
          } catch (error) {
            return 0;
          }
        })
        .slice(0, 4);

      // Get tenant units for expiring tenants
      const expiringTenantsWithUnits = await Promise.all(
        expiringTenants.map(async (tenant) => {
          try {
            const tenantUnits = await this.tenantUnitRepository.getByTenantID(
              tenant.id
            );
            const units = await Promise.all(
              tenantUnits.map(async (tu) => {
                try {
                  const unit = await this.unitRepository.findById(tu.unit_id);
                  return unit;
                } catch (error) {
                  ctx.log?.warn({ unit_id: tu.unit_id, error: error.message }, 'Failed to get unit');
                  return null;
                }
              })
            );
            return {
              ...tenant,
              units: units.filter(u => u !== null),
            };
          } catch (error) {
            ctx.log?.warn({ tenant_id: tenant.id, error: error.message }, 'Failed to get tenant units');
            return {
              ...tenant,
              units: [],
            };
          }
        })
      );

      // Get workers (users with role Kebersihan or Keamanan)
      const allUsers = await this.userRepository.listAll({}, ctx);
      const workers = (allUsers.users || []).filter(
        (user) =>
          user &&
          user.role &&
          user.role.name &&
          typeof user.role.name === 'string' &&
          (user.role.name.toLowerCase() === 'kebersihan' ||
            user.role.name.toLowerCase() === 'keamanan')
      );

      // Get worker stats (attendance and task completion)
      const workersWithStats = await Promise.all(
        workers.slice(0, 4).map(async (worker) => {
          // Calculate attendance percentage (last 30 days)
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          // Get user tasks for this worker
          const userTasks = await this.userTaskRepository.findByUserId(
            worker.id,
            { limit: 1000, offset: 0 },
            ctx
          );

          // Calculate task completion
          // findByUserId returns an array of user tasks (main tasks with sub_user_task array)
          const allTasks = Array.isArray(userTasks) ? userTasks : [];
          // Flatten main tasks and their child tasks (sub_user_task)
          const flatTasks = allTasks.reduce((acc, mainTask) => {
            acc.push(mainTask);
            if (mainTask.sub_user_task && Array.isArray(mainTask.sub_user_task) && mainTask.sub_user_task.length > 0) {
              acc.push(...mainTask.sub_user_task);
            }
            return acc;
          }, []);
          
          const totalTasks = flatTasks.length;
          const completedTasks = flatTasks.filter(
            (ut) => {
              // Check status field (string) or completed_at field
              const status = ut.status || (ut.completed_at ? 'completed' : 'pending');
              return status === 'completed' || ut.completed_at !== null;
            }
          ).length;
          const taskCompletion =
            totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

          // For attendance, we'll use a simplified calculation
          // In a real scenario, you'd query the attendance table
          const attendance = 98; // Placeholder - should be calculated from attendance records

          return {
            id: worker.id,
            name: worker.name,
            email: worker.email,
            role: worker.role?.name || 'Unknown',
            attendance: attendance,
            taskCompletion: taskCompletion,
          };
        })
      );

      // Helper function to calculate task completion by role for a date range
      const calculateTaskCompletionByRole = (tasks, startDate, endDate) => {
        const filteredTasks = tasks.filter((ut) => {
          if (!ut.created_at) return false;
          const taskDate = new Date(ut.created_at);
          return taskDate >= startDate && taskDate < endDate;
        });

        // Categorize tasks by role (Keamanan and Kebersihan)
        const keamananTasks = filteredTasks.filter((ut) => {
          const roleName = ut.task?.role?.name || ut.user?.role?.name || '';
          return roleName.toLowerCase() === 'keamanan';
        });

        const kebersihanTasks = filteredTasks.filter((ut) => {
          const roleName = ut.task?.role?.name || ut.user?.role?.name || '';
          return roleName.toLowerCase() === 'kebersihan';
        });

        // Calculate completion for Keamanan
        const keamananTotal = keamananTasks.length;
        const keamananCompleted = keamananTasks.filter((ut) => {
          const status = ut.status || (ut.completed_at ? 'completed' : 'pending');
          return status === 'completed' || ut.completed_at !== null;
        }).length;
        const keamananCompletion = keamananTotal > 0
          ? Math.round((keamananCompleted / keamananTotal) * 100)
          : 0;

        // Calculate completion for Kebersihan
        const kebersihanTotal = kebersihanTasks.length;
        const kebersihanCompleted = kebersihanTasks.filter((ut) => {
          const status = ut.status || (ut.completed_at ? 'completed' : 'pending');
          return status === 'completed' || ut.completed_at !== null;
        }).length;
        const kebersihanCompletion = kebersihanTotal > 0
          ? Math.round((kebersihanCompleted / kebersihanTotal) * 100)
          : 0;

        return {
          keamanan: {
            completion: keamananCompletion,
            total: keamananTotal,
            completed: keamananCompleted,
          },
          kebersihan: {
            completion: kebersihanCompletion,
            total: kebersihanTotal,
            completed: kebersihanCompleted,
          },
        };
      };

      // Get all user tasks once (for last 3 months to cover weekly and monthly calculations)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      threeMonthsAgo.setHours(0, 0, 0, 0);

      const allUserTasksResult = await this.userTaskRepository.findAll(
        {
          limit: 50000,
          offset: 0,
        },
        ctx
      );

      // Filter tasks to only include those from the last 3 months
      const allTasks = (allUserTasksResult.rows || []).filter((ut) => {
        if (!ut.created_at) return false;
        const taskDate = new Date(ut.created_at);
        return taskDate >= threeMonthsAgo;
      });

      // Get daily task completion for last 7 days, categorized by role (Keamanan and Kebersihan)
      const dailyTaskCompletion = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const completion = calculateTaskCompletionByRole(allTasks, date, nextDate);
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        dailyTaskCompletion.push({
          day: dayNames[date.getDay()],
          date: date.toISOString().split('T')[0],
          ...completion,
        });
      }

      // Get monthly task completion for last 12 months, categorized by role
      const monthlyTaskCompletion = [];
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - i);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        const completion = calculateTaskCompletionByRole(allTasks, monthStart, monthEnd);
        
        // Format month label (e.g., "Januari 2024")
        const monthLabel = monthStart.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        
        monthlyTaskCompletion.push({
          month: monthLabel,
          monthStart: monthStart.toISOString().split('T')[0],
          monthEnd: new Date(monthEnd.getTime() - 1).toISOString().split('T')[0],
          ...completion,
        });
      }

      // Get units for complaints
      const complaintsWithUnits = await Promise.all(
        (recentComplaints.complaintReports || []).map(async (cr) => {
          if (!cr) {
            return null;
          }
          let unitDisplay = '-';
          if (cr.tenant_id) {
            try {
              const tenant = await this.tenantRepository.findById(cr.tenant_id, ctx);
              if (tenant) {
                const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenant.id);
                if (tenantUnits && tenantUnits.length > 0) {
                  const units = await Promise.all(
                    tenantUnits.slice(0, 1).map(async (tu) => {
                      try {
                        const unit = await this.unitRepository.findById(tu.unit_id);
                        return unit;
                      } catch (error) {
                        ctx.log?.warn({ unit_id: tu.unit_id, error: error.message }, 'Failed to get unit for complaint');
                        return null;
                      }
                    })
                  );
                  const validUnits = units.filter(u => u !== null);
                  if (validUnits.length > 0) {
                    const unit = validUnits[0];
                    unitDisplay = unit.asset?.name || unit.name || '-';
                  }
                }
              }
            } catch (error) {
              ctx.log?.warn({ tenant_id: cr.tenant_id, error: error.message }, 'Failed to get tenant/unit for complaint');
            }
          }
          
          return {
            id: cr.id,
            unit: unitDisplay,
            reporter: cr.reporter?.name || cr.reporter?.email || '-',
            date: cr.created_at,
            status: ComplaintReportStatusIntToStr[cr.status] || 'pending',
          };
        })
      );

      // Filter out null complaints
      const validComplaints = complaintsWithUnits.filter(c => c !== null);

      return {
        complaints: {
          recent: validComplaints,
          stats: complaintStats,
        },
        expiringTenants: expiringTenantsWithUnits.map((tenant) => {
          if (!tenant || !tenant.contract_end_at) {
            return {
              id: tenant?.id || '',
              name: tenant?.name || '-',
              unit: '-',
              monthsRemaining: 0,
              daysRemaining: 0,
              contractEndAt: '',
            };
          }
          
          const endDate = new Date(tenant.contract_end_at);
          const now = new Date();
          const diffTime = endDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const diffMonths = Math.ceil(diffDays / 30);

          // Format unit name: "Unit X - Asset Name"
          let unitDisplay = '-';
          if (tenant.units && tenant.units.length > 0) {
            unitDisplay = tenant.units
              .map((u, idx) => {
                const unitName = u.name || `Unit ${idx + 1}`;
                const assetName = u.asset?.name || '';
                return assetName ? `${unitName} - ${assetName}` : unitName;
              })
              .join(', ');
          }

          return {
            id: tenant.id,
            name: tenant.name,
            unit: unitDisplay,
            monthsRemaining: diffMonths,
            daysRemaining: diffDays,
            contractEndAt: tenant.contract_end_at,
          };
        }),
        workers: workersWithStats,
        dailyTaskCompletion: dailyTaskCompletion,
        monthlyTaskCompletion: monthlyTaskCompletion,
      };
    } catch (error) {
      ctx.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardUsecase.getDashboardData_error'
      );
      throw error;
    }
  }

  async getTopAssetRevenue(ctx) {
    try {
      ctx.log?.info({}, 'DashboardUsecase.getTopAssetRevenue');

      // Get all active tenants (status = 1 means active)
      const allTenants = await this.tenantRepository.findAll({ status: 1 }, ctx);
      
      ctx.log?.info({ 
        totalTenants: allTenants?.tenants?.length || 0,
        tenants: allTenants?.tenants?.map(t => ({ id: t.id, name: t.name, status: t.status, rent_price: t.rent_price })) || []
      }, 'DashboardUsecase.getTopAssetRevenue - Fetched Tenants');
      
      // Map to calculate revenue per asset
      const assetRevenueMap = new Map();
      const assetNameMap = new Map();
      
      if (allTenants?.tenants && allTenants.tenants.length > 0) {
        // Get all tenant units in batch
        const tenantIds = allTenants.tenants.map(t => t.id);
        const allTenantUnits = await Promise.all(
          tenantIds.map(id => this.tenantUnitRepository.getByTenantID(id))
        );

        // Get all unit IDs
        const unitIds = [];
        allTenantUnits.forEach(tenantUnits => {
          if (tenantUnits && tenantUnits.length > 0) {
            tenantUnits.forEach(tu => {
              // Handle Sequelize model instances
              const unitId = tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id;
              if (unitId && !unitIds.includes(unitId)) {
                unitIds.push(unitId);
              }
            });
          }
        });
      
        // Get all units in batch
        const allUnits = await Promise.all(
          unitIds.map(id => this.unitRepository.findById(id))
        );
        // Create unit map
        const unitMap = new Map();
        allUnits.forEach(unit => {
          if (unit && unit.id) {
            unitMap.set(unit.id, unit);
          }
        });

        // Get all asset IDs
        const assetIds = new Set();
        allUnits.forEach(unit => {
          if (unit && unit.asset?.id) {
            assetIds.add(unit.asset?.id);
          }
        });
        // Get all assets in batch
        const allAssets = await Promise.all(
          Array.from(assetIds).map(id => this.assetRepository.findById(id, ctx))
        );

        // Create asset name map
        allAssets.forEach(asset => {
          if (asset && asset.id) {
            assetNameMap.set(asset.id, asset.name);
          }
        });

        // Calculate revenue per asset
        allTenants.tenants.forEach((tenant, tenantIndex) => {
          // Handle Sequelize model instances
          const tenantData = tenant.toJSON ? tenant.toJSON() : tenant;
          
          // Status should already be filtered to 1, but double-check
          if (!tenantData) {
            ctx.log?.warn({ tenantIndex }, 'DashboardUsecase.getTopAssetRevenue - Skipping invalid tenant');
            return;
          }
          
          // Always use tenant rent_price as revenue source
          const rentPrice = parseFloat(tenantData.rent_price) || 0;
          const tenantUnits = allTenantUnits[tenantIndex];
          
          ctx.log?.info({ 
            tenantId: tenantData.id,
            tenantName: tenantData.name,
            status: tenantData.status,
            rentPrice,
            tenantUnitsCount: tenantUnits?.length || 0
          }, 'DashboardUsecase.getTopAssetRevenue - Processing Tenant');
          
          // Only process if tenant has units and rent_price > 0
          if (tenantUnits && tenantUnits.length > 0 && rentPrice > 0) {
            // Distribute tenant rent_price equally among all units
            const revenuePerUnit = rentPrice / tenantUnits.length;
            
            tenantUnits.forEach(tenantUnit => {
              // Handle Sequelize model instances
              const unitId = tenantUnit.unit_id || tenantUnit.get?.('unit_id') || tenantUnit.toJSON?.()?.unit_id;
              const unit = unitMap.get(unitId);
              if (unit && unit.asset?.id) {
                const assetId = unit.asset?.id;
                const currentRevenue = assetRevenueMap.get(assetId) || 0;
                // Always use tenant rent_price divided by number of units
                assetRevenueMap.set(assetId, currentRevenue + revenuePerUnit);
                ctx.log?.info({ 
                  assetId, 
                  unitId,
                  revenuePerUnit,
                  currentRevenue,
                  newRevenue: currentRevenue + revenuePerUnit
                }, 'DashboardUsecase.getTopAssetRevenue - Adding Revenue');
              }
            });
          }
        });
      }

      // Convert map to array and sort by revenue descending
      let topAssets = [];
      if (assetRevenueMap.size > 0) {
        topAssets = Array.from(assetRevenueMap.entries())
          .map(([assetId, revenue]) => {
            const revenueValue = parseFloat(revenue) || 0;
            return {
              id: assetId,
              name: assetNameMap.get(assetId) || 'Unknown Asset',
              revenue: revenueValue,
            };
          })
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5)
          .map(asset => ({
            name: asset.name,
            revenue: asset.revenue,
            formatted: new Intl.NumberFormat('id-ID', {
              style: 'currency',
              currency: 'IDR',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(asset.revenue),
          }));
      }

      ctx.log?.info({ 
        topAssetsCount: topAssets.length,
        assetRevenueMapSize: assetRevenueMap.size,
        topAssets: topAssets.map(a => ({ name: a.name, revenue: a.revenue }))
      }, 'DashboardUsecase.getTopAssetRevenue - Result');

      // Always return an array, even if empty
      return Array.isArray(topAssets) ? topAssets : [];
    } catch (error) {
      ctx.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardUsecase.getTopAssetRevenue_error'
      );
      throw error;
    }
  }

  async getRevenueGrowth(ctx) {
    try {
      ctx.log?.info({}, 'DashboardUsecase.getRevenueGrowth');

      // Get all tenants
      const allTenants = await this.tenantRepository.findAll({}, ctx);
      
      // Initialize years from 2018 to current year + 1
      const currentYear = new Date().getFullYear();
      const startYear = 2018;
      const endYear = currentYear + 1;
      const years = [];
      for (let year = startYear; year <= endYear; year++) {
        years.push(year.toString());
      }

      // Initialize revenue map
      const revenueByYear = new Map();
      years.forEach(year => {
        revenueByYear.set(year, 0);
      });

      // Calculate revenue per year based on contract_begin_at
      if (allTenants?.tenants && allTenants.tenants.length > 0) {
        for (const tenant of allTenants.tenants) {
          if (!tenant || !tenant.contract_begin_at) continue;
          
          const contractBeginDate = new Date(tenant.contract_begin_at);
          const contractYear = contractBeginDate.getFullYear().toString();
          
          // Only count active tenants
          if (tenant.status === 1 && tenant.rent_price) {
            const currentRevenue = revenueByYear.get(contractYear) || 0;
            revenueByYear.set(contractYear, currentRevenue + (tenant.rent_price || 0));
          }
        }
      }

      // Convert to array format for chart
      const revenueData = years.map(year => revenueByYear.get(year) || 0);

      return {
        years: years,
        revenue: revenueData,
      };
    } catch (error) {
      ctx.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardUsecase.getRevenueGrowth_error'
      );
      throw error;
    }
  }

  /**
   * Get user_task list for non-repeat tasks only (dashboard).
   * Returns items with separated user, asset, and task objects.
   */
  async getNonRepeatUserTasks(filters = {}, ctx = {}) {
    try {
      ctx.log?.info({ filters }, 'DashboardUsecase.getNonRepeatUserTasks');
      const { rows, total } = await this.userTaskRepository.findAllForNonRepeatTasks(filters, ctx);
      const items = rows.map((ut) => {
        const user = ut.user || {};
        const task = ut.task || {};
        const asset = task.asset || {};
        const taskTypeInt = task.task_type;
        const taskTypeStr = TaskTypeIntToStr[taskTypeInt] ?? 'non_repeat';
        const statusStr = ut.status ?? 'pending';
        const completed = statusStr === 'completed' || ut.status === 2;
        return {
          user_task_id: ut.id,
          user_id: ut.user_id,
          task_id: ut.task_id,
          status: statusStr,
          completed,
          created_at: ut.created_at,
          completed_at: ut.completed_at,
          notes: ut.notes ?? null,
          user: {
            id: user.id ?? null,
            name: user.name ?? null,
            email: user.email ?? null,
          },
          asset: {
            id: asset.id ?? null,
            name: asset.name ?? null,
            code: asset.code ?? null,
          },
          task: {
            id: task.id ?? null,
            name: task.name ?? null,
            area: task.area ?? null,
            task_type: taskTypeStr,
          },
        };
      });
      return {
        items,
        total,
        limit: filters.limit ?? null,
        offset: filters.offset ?? null,
      };
    } catch (error) {
      ctx.log?.error(
        { filters, error: error.message, stack: error.stack },
        'DashboardUsecase.getNonRepeatUserTasks_error'
      );
      throw error;
    }
  }
}

module.exports = DashboardUsecase;

