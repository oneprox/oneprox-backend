const sequelize = require('../models/sequelize');
const { Op } = require('sequelize');
const {
  ComplaintReportStatusIntToStr,
} = require('../models/ComplaintReport');

class DashboardUsecase {
  constructor(
    complaintReportRepository,
    tenantRepository,
    userRepository,
    userTaskRepository,
    attendanceRepository,
    tenantUnitRepository,
    unitRepository,
    assetRepository,
    tenantPaymentLogRepository,
    tenantLegalRepository
  ) {
    this.complaintReportRepository = complaintReportRepository;
    this.tenantRepository = tenantRepository;
    this.userRepository = userRepository;
    this.userTaskRepository = userTaskRepository;
    this.attendanceRepository = attendanceRepository;
    this.tenantUnitRepository = tenantUnitRepository;
    this.unitRepository = unitRepository;
    this.assetRepository = assetRepository;
    this.tenantPaymentLogRepository = tenantPaymentLogRepository;
    this.tenantLegalRepository = tenantLegalRepository;
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

  async getAssetOverview(queryParams, ctx) {
    try {
      ctx.log?.info({ queryParams }, 'DashboardUsecase.getAssetOverview');
      
      const { assetId } = queryParams || {};
      
      // Load all assets
      const allAssetsResponse = await this.assetRepository.listAll({ limit: 1000 }, ctx);
      const allAssets = allAssetsResponse?.assets || allAssetsResponse?.data || [];
      
      // Filter by selected asset
      let filteredAssets = allAssets;
      if (assetId && assetId !== 'all') {
        filteredAssets = allAssets.filter(a => {
          const assetData = a.toJSON ? a.toJSON() : a;
          return assetData.id === assetId;
        });
      }
      
      // Load all tenants
      const allTenantsResponse = await this.tenantRepository.findAll({ limit: 10000 }, ctx);
      const allTenants = allTenantsResponse?.tenants || allTenantsResponse?.data || [];
      
      // Filter hanya tenant yang aktif
      const activeTenantsRaw = allTenants.filter(t => {
        const tenantData = t.toJSON ? t.toJSON() : t;
        return tenantData.status === 1 || tenantData.status === 'active';
      });
      
      // Load units for each active tenant
      const activeTenantIds = activeTenantsRaw.map(t => {
        const tenantData = t.toJSON ? t.toJSON() : t;
        return tenantData.id;
      });
      
      const allTenantUnits = await Promise.all(
        activeTenantIds.map(id => this.tenantUnitRepository.getByTenantID(id))
      );
      
      // Get all unit IDs from tenant units
      const unitIds = [];
      allTenantUnits.forEach(tenantUnits => {
        if (tenantUnits && tenantUnits.length > 0) {
          tenantUnits.forEach(tu => {
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
      
      // Create unit map for quick lookup
      const unitMap = new Map();
      allUnits.forEach(unit => {
        if (unit && unit.id) {
          unitMap.set(unit.id, unit);
        }
      });
      
      // Attach units to each active tenant
      const activeTenants = activeTenantsRaw.map((tenant, index) => {
        const tenantData = tenant.toJSON ? tenant.toJSON() : tenant;
        const tenantUnits = allTenantUnits[index] || [];
        console.log('Tenant Units:', tenantUnits)
        const units = tenantUnits
          .map(tu => {
            const unitId = tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id;
            return unitMap.get(unitId);
          })
          .filter(u => u !== undefined);
        tenantData.units = units;
        return tenantData;
      });
      
      // Calculate overview data dari tenant aktif
      let totalLandArea = 0;
      let totalBuildingArea = 0;
      let occupiedUnits = 0;
      let totalUnits = 0;
      let totalRevenue = 0;
      
      filteredAssets.forEach(asset => {
        const assetData = asset.toJSON ? asset.toJSON() : asset;
        
        // Get units for this asset
        const assetUnits = allUnits.filter(u => {
          const unitData = u.toJSON ? u.toJSON() : u;
          return unitData.asset_id === assetData.id || unitData.asset?.id === assetData.id;
        });
        totalUnits += assetUnits.length;
        
        // Get active tenants for this asset (through units)
        const assetUnitIds = assetUnits.map(u => {
          const unitData = u.toJSON ? u.toJSON() : u;
          return unitData.id;
        });

        const assetTenants = activeTenants.filter(t => {
          if (!t.units || !Array.isArray(t.units)) return false;
          return t.units.some((tu) => {
            const unitId = tu.id;
            const unitAssetId = tu.asset?.id || tu.asset_id;
            return assetUnitIds.includes(unitId) || unitAssetId === assetData.id;
          });
        });
        
        occupiedUnits += assetTenants.length;
        
        // Calculate land area dan building area dari tenant aktif
        assetTenants.forEach(tenant => {
          const tenantLandArea = parseFloat(tenant.land_area) || 0;
          const tenantBuildingArea = parseFloat(tenant.building_area) || 0;
          totalLandArea += tenantLandArea;
          totalBuildingArea += tenantBuildingArea;
        });
        
        // Calculate revenue
        assetTenants.forEach(tenant => {
          const rentPrice = parseFloat(tenant.rent_price) || 0;
          totalRevenue += rentPrice;
        });
      });
      
      const occupancy = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
      const averageRate = totalBuildingArea > 0 ? totalRevenue / totalBuildingArea : 0;
      
      // Calculate utilization data berdasarkan jumlah tenant per kategori
      const utilizationMap = new Map();
      const allFilteredTenants = filteredAssets.flatMap(asset => {
        const assetData = asset.toJSON ? asset.toJSON() : asset;
        const assetUnits = allUnits.filter(u => {
          return u.asset_id === assetData.id || u.asset?.id === assetData.id;
        });
        const assetUnitIds = assetUnits.map(u => u.id);
        return activeTenants.filter(t => {
          if (!t.units || !Array.isArray(t.units)) return false;
          return t.units.some((tu) => {
            const unitId = tu.id;
            const unitAssetId = tu.asset?.id || tu.asset_id;
            return assetUnitIds.includes(unitId) || unitAssetId === assetData.id;
          });
        });
      });
      
      // Group by category and count jumlah tenant
      allFilteredTenants.forEach(tenant => {
        const categoryName = tenant.category?.name || 'Lainnya';
        const currentCount = utilizationMap.get(categoryName) || 0;
        utilizationMap.set(categoryName, currentCount + 1);
      });
      
      // Convert to array format
      const utilizationArray = Array.from(utilizationMap.entries())
        .map(([category, value]) => ({ category, value }))
        .sort((a, b) => b.value - a.value);
      
      // Calculate financial performance data per triwulan (Q1, Q2, Q3, Q4)
      const currentYear = new Date().getFullYear();
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      const financialMap = new Map();
      
      // Initialize semua triwulan
      quarters.forEach(quarter => {
        financialMap.set(quarter, { realisasi: 0, target: 0 });
      });
      
      // Helper function to get quarter from month
      const getQuarter = (month) => {
        if (month >= 1 && month <= 3) return 'Q1';
        if (month >= 4 && month <= 6) return 'Q2';
        if (month >= 7 && month <= 9) return 'Q3';
        if (month >= 10 && month <= 12) return 'Q4';
        return 'Q1';
      };
      
      // Get ALL payment logs for all filtered tenants
      const allTenantIds = allFilteredTenants.map(t => t.id);
      
      const allPayments = [];
      for (const tenantId of allTenantIds) {
        try {
          const payments = await this.tenantPaymentLogRepository.findByTenantId(tenantId, { limit: 1000 }, ctx);
          if (Array.isArray(payments)) {
            allPayments.push(...payments);
          } else if (payments?.rows) {
            allPayments.push(...payments.rows);
          } else if (payments?.data) {
            allPayments.push(...payments.data);
          }
        } catch (err) {
          ctx.log?.warn({ tenantId, error: err.message }, 'Error loading payments for tenant');
        }
      }
      
      // Process all payments untuk menghitung target dan realisasi
      allPayments.forEach((payment) => {
        const paymentData = payment.toJSON ? payment.toJSON() : payment;
        
        // Hitung TARGET dari billing_amount berdasarkan payment_deadline
        if (paymentData.payment_deadline && paymentData.billing_amount) {
          const deadlineDate = new Date(paymentData.payment_deadline);
          const deadlineYear = deadlineDate.getFullYear();
          
          if (deadlineYear === currentYear) {
            const month = deadlineDate.getMonth() + 1;
            const quarter = getQuarter(month);
            const billingAmount = parseFloat(paymentData.billing_amount) || 0;
            const current = financialMap.get(quarter) || { realisasi: 0, target: 0 };
            current.target += billingAmount;
            financialMap.set(quarter, current);
          }
        }
        
        // Hitung REALISASI dari paid_amount berdasarkan payment_date (hanya yang sudah dibayar)
        if (paymentData.payment_date && paymentData.paid_amount && paymentData.status === 1) {
          const paymentDate = new Date(paymentData.payment_date);
          const paymentYear = paymentDate.getFullYear();
          
          if (paymentYear === currentYear) {
            const month = paymentDate.getMonth() + 1;
            const quarter = getQuarter(month);
            const paidAmount = parseFloat(paymentData.paid_amount) || 0;
            const current = financialMap.get(quarter) || { realisasi: 0, target: 0 };
            current.realisasi += paidAmount;
            financialMap.set(quarter, current);
          }
        }
      });
      
      // Convert to array format
      const financialArray = quarters.map(quarter => {
        const data = financialMap.get(quarter) || { realisasi: 0, target: 0 };
        return { quarter, realisasi: data.realisasi, target: data.target };
      });
      
      // Load legal data
      const legalTableData = [];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYearForLegal = now.getFullYear();
      
      // Get legal documents for each tenant
      for (const tenant of allTenants) {
        try {
          const tenantData = tenant.toJSON ? tenant.toJSON() : tenant;
          // Get tenant units for this tenant
          const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenantData.id);
          const tenantUnitIds = tenantUnits.map(tu => tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id);
          const tenantUnitsWithDetails = await Promise.all(
            tenantUnitIds.map(id => this.unitRepository.findById(id))
          );
          tenantData.units = tenantUnitsWithDetails.filter(u => u !== null);
          
          const legals = await this.tenantLegalRepository.findByTenantId(tenantData.id, ctx);
          const legalArray = Array.isArray(legals) ? legals : [];
          
          const tenantUnitsForLegal = tenantData.units && Array.isArray(tenantData.units) ? tenantData.units : [];
          
          legalArray.forEach((legal) => {
            const legalData = legal.toJSON ? legal.toJSON() : legal;
            if (!legalData.due_date || legalData.status === 'selesai') return;
            
            const dueDate = new Date(legalData.due_date);
            const dueMonth = dueDate.getMonth();
            const dueYear = dueDate.getFullYear();
            
            if (dueYear < currentYearForLegal || (dueYear === currentYearForLegal && dueMonth < currentMonth)) {
              return;
            }
            
            const tenantUnit = tenantUnitsForLegal[0];
            const asset = tenantUnit?.asset || (tenantUnit?.asset_id ? filteredAssets.find(a => {
              const assetData = a.toJSON ? a.toJSON() : a;
              return assetData.id === tenantUnit.asset_id;
            }) : null);
            
            if (!asset) return;
            
            const assetData = asset.toJSON ? asset.toJSON() : asset;
            if (assetId && assetId !== 'all' && assetData.id !== assetId) return;
            
            legalTableData.push({
              id: legalData.id,
              nama: tenantData.name || '-',
              aset: assetData.name || '-',
              unit: tenantUnit?.name || '-',
              jatuhTempo: dueDate.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }),
              kewajibanMitra: legalData.description || legalData.doc_type || '-',
              progress: 10,
              dokumen: legalData.keterangan || legalData.doc_type || '-',
              status: 'On Process',
              tipe: 'legal'
            });
          });
        } catch (err) {
          ctx.log?.warn({ tenantId: tenant.id, error: err.message }, 'Error loading legal for tenant');
        }
      }
      
      // Get payment logs (penagihan) yang belum dibayar
      for (const tenant of allTenants) {
        try {
          const tenantData = tenant.toJSON ? tenant.toJSON() : tenant;
          // Ensure tenant has units loaded
          if (!tenantData.units) {
            const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenantData.id);
            const tenantUnitIds = tenantUnits.map(tu => tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id);
            const tenantUnitsWithDetails = await Promise.all(
              tenantUnitIds.map(id => this.unitRepository.findById(id))
            );
            tenantData.units = tenantUnitsWithDetails.filter(u => u !== null);
          }
          
          const payments = await this.tenantPaymentLogRepository.findByTenantId(tenantData.id, { limit: 1000, status: 0 }, ctx);
          const paymentArray = Array.isArray(payments) ? payments : (payments?.rows || payments?.data || []);
          
          const tenantUnits = tenantData.units && Array.isArray(tenantData.units) ? tenantData.units : [];
          
          paymentArray.forEach((payment) => {
            const paymentData = payment.toJSON ? payment.toJSON() : payment;
            if (!paymentData.payment_deadline || paymentData.status !== 0) return;
            
            const deadlineDate = new Date(paymentData.payment_deadline);
            const deadlineMonth = deadlineDate.getMonth();
            const deadlineYear = deadlineDate.getFullYear();
            
            if (deadlineYear < currentYearForLegal || (deadlineYear === currentYearForLegal && deadlineMonth < currentMonth)) {
              return;
            }
            
            const tenantUnit = tenantUnitsForLegal[0];
            const asset = tenantUnit?.asset || (tenantUnit?.asset_id ? filteredAssets.find(a => {
              const assetData = a.toJSON ? a.toJSON() : a;
              return assetData.id === tenantUnit.asset_id;
            }) : null);
            
            if (!asset) return;
            
            const assetData = asset.toJSON ? asset.toJSON() : asset;
            if (assetId && assetId !== 'all' && assetData.id !== assetId) return;
            
            legalTableData.push({
              id: paymentData.id,
              nama: tenantData.name || '-',
              aset: assetData.name || '-',
              unit: tenantUnit?.name || '-',
              jatuhTempo: deadlineDate.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }),
              kewajibanMitra: paymentData.billing_type || 'Pembayaran Sewa',
              progress: 0,
              dokumen: paymentData.billing_period || '-',
              status: 'Belum Dibayar',
              tipe: 'payment'
            });
          });
        } catch (err) {
          ctx.log?.warn({ tenantId: tenant.id, error: err.message }, 'Error loading payments for tenant');
        }
      }
      
      return {
        overview: {
          totalLandArea,
          totalBuildingArea,
          occupancy,
          averageRate
        },
        utilization: utilizationArray,
        financial: financialArray,
        legal: legalTableData
      };
    } catch (error) {
      ctx.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardUsecase.getAssetOverview_error'
      );
      throw error;
    }
  }

  async getFinancialTable(queryParams, ctx) {
    try {
      ctx.log?.info({ queryParams }, 'DashboardUsecase.getFinancialTable');
      
      const { assetId } = queryParams || {};
      
      // Load all tenants
      const allTenantsResponse = await this.tenantRepository.findAll({ limit: 10000 }, ctx);
      const allTenants = allTenantsResponse?.tenants || allTenantsResponse?.data || [];
      
      // Load all assets for fallback
      const allAssetsResponse = await this.assetRepository.listAll({ limit: 1000 }, ctx);
      const allAssets = allAssetsResponse?.assets || allAssetsResponse?.data || [];
      
      const financialTableData = [];
      const now = new Date();
      
      // Get payment logs for each tenant
      for (const tenant of allTenants) {
        try {
          const tenantData = tenant.toJSON ? tenant.toJSON() : tenant;
          
          // Get tenant units
          const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenantData.id);
          const tenantUnitIds = tenantUnits.map(tu => tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id);
          const tenantUnitsWithDetails = await Promise.all(
            tenantUnitIds.map(id => this.unitRepository.findById(id))
          );
          tenantData.units = tenantUnitsWithDetails.filter(u => u !== null);
          
          const payments = await this.tenantPaymentLogRepository.findByTenantId(tenantData.id, { limit: 1000 }, ctx);
          const paymentArray = Array.isArray(payments) ? payments : (payments?.rows || payments?.data || []);
          
          paymentArray.forEach((payment) => {
            const paymentData = payment.toJSON ? payment.toJSON() : payment;
            
            // Get asset from unit
            const tenantUnit = tenantData.units && tenantData.units.length > 0 ? tenantData.units[0] : null;
            const asset = tenantUnit?.asset || (tenantUnit?.asset_id ? allAssets.find(a => {
              const assetData = a.toJSON ? a.toJSON() : a;
              return assetData.id === tenantUnit.asset_id;
            }) : null);
            
            // Skip if no asset found
            if (!asset) return;
            
            const assetData = asset.toJSON ? asset.toJSON() : asset;
            
            // Filter by selected asset
            if (assetId && assetId !== 'all' && assetData.id !== assetId) {
              return;
            }
            
            // Only show unpaid payments (status 0 = unpaid, 2 = expired)
            if (paymentData.status === 0 || paymentData.status === 2) {
              const deadline = paymentData.payment_deadline ? new Date(paymentData.payment_deadline) : null;
              const aging = deadline ? Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)) : 0;
              
              // Determine status based on deadline
              let status = 'On Process';
              
              if (deadline) {
                const daysUntilDeadline = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysUntilDeadline < 0) {
                  status = 'Overdue';
                } else if (daysUntilDeadline <= 30) {
                  status = 'On Process';
                }
              }
              
              // Deskripsi: billing_type || billing_period || 'Tagihan Sewa'
              const deskripsi = paymentData.billing_type || paymentData.billing_period || 'Tagihan Sewa';
              
              financialTableData.push({
                id: paymentData.id,
                nama: tenantData.name || '-',
                aset: assetData.name || '-',
                unit: tenantUnit?.name || '-',
                jatuhTempo: deadline ? deadline.toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                }) : '-',
                deskripsi: deskripsi,
                nomorInvoice: `INV-${paymentData.id}`,
                nilaiInvoice: parseFloat(paymentData.amount) || parseFloat(paymentData.billing_amount) || 0,
                tanggalInvoice: paymentData.created_at ? new Date(paymentData.created_at).toLocaleDateString('id-ID') : '-',
                status: status,
                aging: aging > 0 ? aging : 0,
                deadlineTimestamp: deadline ? deadline.getTime() : null // Untuk sorting
              });
            }
          });
        } catch (err) {
          ctx.log?.warn({ tenantId: tenant.id, error: err.message }, 'Error loading payments for tenant');
        }
      }
      
      // Sort by deadline date (tanggal kecil dulu / ascending)
      financialTableData.sort((a, b) => {
        // Jika tidak ada deadline, taruh di akhir
        if (!a.deadlineTimestamp && !b.deadlineTimestamp) return 0;
        if (!a.deadlineTimestamp) return 1;
        if (!b.deadlineTimestamp) return -1;
        
        // Urutkan berdasarkan tanggal jatuh tempo dari yang terkecil
        return a.deadlineTimestamp - b.deadlineTimestamp;
      });
      
      return financialTableData;
    } catch (error) {
      ctx.log?.error(
        { error: error.message, stack: error.stack },
        'DashboardUsecase.getFinancialTable_error'
      );
      throw error;
    }
  }
}

module.exports = DashboardUsecase;

