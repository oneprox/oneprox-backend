const moment = require("moment");
const sequelize = require("../models/sequelize");
const dateFormat = "DD-MM-YYYY HH:mm";
const PrefixTenant = "TENT";
const {
  DurationUnit,
  DurationUnitStr,
  TenantStatusIntToStr,
  TenantStatusStrToInt,
} = require("../models/Tenant");
const { AttachmentType } = require("../models/TenantAttachment");
const { transformImageUrls } = require('../services/baseUrl');

class TenantUseCase {
  constructor(
    tenantRepository,
    tenantAttachmentRepository,
    tenantUnitRepository,
    tenantCategoryMapRepo,
    tenantCategoryRepo,
    unitRepository,
    tenantLogRepository,
    depositoLogRepository,
    userUsecase,
    tenantPaymentLogRepository
  ) {
    this.tenantRepository = tenantRepository;
    this.tenantAttachmentRepository = tenantAttachmentRepository;
    this.tenantUnitRepository = tenantUnitRepository;
    this.tenantCategoryMapRepo = tenantCategoryMapRepo;
    this.tenantCategoryRepo = tenantCategoryRepo;
    this.unitRepository = unitRepository;
    this.tenantLogRepository = tenantLogRepository;
    this.depositoLogRepository = depositoLogRepository;
    this.userUsecase = userUsecase;
    this.tenantPaymentLogRepository = tenantPaymentLogRepository;
  }

  async createTenant(data, ctx) {
    try {
      ctx.log?.info(data, "TenantUsecase.createTenant");
      const result = await sequelize.transaction(async (t) => {
        // Jika user_id tidak ada dan ada data new_user, buat user terlebih dahulu
        if ((!data.user_id || data.user_id === '') && data.new_user && this.userUsecase) {
          console.log("Creating new user from new_user data");
          const newUserPayload = {
            name: data.new_user.name,
            email: data.new_user.email,
            password: data.new_user.password,
            phone: data.new_user.phone,
            gender: data.new_user.gender,
            roleId: data.new_user.roleId || data.new_user.role_id,
            status: data.new_user.status || 'active',
          };

          let createdUser = await this.userUsecase.createUser(newUserPayload, ctx);
          if (createdUser === 'exists') {
            // Ambil user by email jika sudah ada
            const existing = await this.userUsecase.userRepository.findByEmail(newUserPayload.email, ctx);
            if (!existing) throw new Error('User already exists but cannot be retrieved');
            data.user_id = existing.id;
          } else if (createdUser && createdUser.id) {
            data.user_id = createdUser.id;
          } else {
            throw new Error('Failed to create user for tenant');
          }
          console.log("User created successfully, user_id:", data.user_id);
        }

        // Pastikan user_id tersedia setelah proses di atas
        if (!data.user_id || String(data.user_id).trim() === '') {
          console.error("ERROR: user_id is missing or empty!");
          console.error("data.user_id:", data.user_id);
          console.error("data.new_user:", data.new_user);
          throw new Error('user_id is required for creating tenant');
        }
        
        // Frontend sends: 0 = year, 1 = month (matches DurationUnit constant)
        // DurationUnit constant: year = 0, month = 1
        let rentDurationUnitInt;
        
        // Use years if duration is >= 1 year, otherwise use months
        // rent_duration is INTEGER in DB — must not store fractional years
        if (durationInYears >= 1) {
          rentDuration = Math.max(1, Math.round(durationInYears));
          rentDurationUnitInt = DurationUnit.year; // 0
        } else {
          throw new Error('rent_duration_unit is required and must be 0 (year) or 1 (month)');
        }
        
        ctx.log?.info({ 
          frontend_value: data.rent_duration_unit,
          stored_value: rentDurationUnitInt 
        }, "TenantUsecase.createTenant - rent_duration_unit");
        
        // Convert integer to string for calculateDueDate function
        const rentDurationUnitStr = DurationUnitStr[rentDurationUnitInt];
        
        const createTenantData = {
          user_id: data.user_id,
          name: data.name,
          contract_begin_at: data.contract_begin_at,
          contract_end_at: this.calculateDueDate(
            data.contract_begin_at,
            data.rent_duration,
            rentDurationUnitStr
          ),
          code: this.generateCode(),
          created_by: data.createdBy,
          rent_duration: data.rent_duration,
          rent_duration_unit: rentDurationUnitInt,
          payment_term: data.payment_term !== undefined ? data.payment_term : null,
          rent_price: data.rent_price || null,
          down_payment: data.down_payment || null,
          deposit: data.deposit || null,
          category_id: data.category_id || null,
          status: this.getTenantStatusInt(data.status) || 2, // Default to pending (2) if not provided
        };
        const tenant = await this.tenantRepository.create(
          createTenantData,
          t,
          ctx
        );

        if (tenant) {
          await this.saveTenantAttachments(
            tenant,
            data.tenant_identifications,
            "id",
            t,
            ctx
          );
          await this.saveTenantAttachments(
            tenant,
            data.contract_documents,
            "contract",
            t,
            ctx
          );
          await this.saveTenantUnits(tenant, data.unit_ids, t, ctx);
        }

        const tenantLog = {
          tenant_id: tenant.id,
          action: 'CREATE',
          old_data: null,
          new_data: {
            name: tenant.name,
            code: tenant.code,
            status: TenantStatusIntToStr[tenant.status], // Convert to string for log
            rent_duration: tenant.rent_duration,
            rent_duration_unit: DurationUnitStr[tenant.rent_duration_unit], // Convert back to string for log
            rent_price: tenant.rent_price,
            down_payment: tenant.down_payment,
            deposit: tenant.deposit,
          },
          created_by: ctx.userId,
        };

        await this.tenantLogRepository.create(tenantLog, ctx);
        
        // Create deposito log if deposit is provided
        if (tenant.deposit !== null && tenant.deposit !== undefined) {
          const depositoLog = {
            tenant_id: tenant.id,
            old_deposit: null,
            new_deposit: tenant.deposit,
            reason: 'initial value',
            created_by: ctx.userId,
          };
          await this.depositoLogRepository.create(depositoLog, { ...ctx, transaction: t }, t);
        }
        
        // Create payment logs if payment_term is provided
        // payment_term: 0 = year, 1 = month
        // Note: payment_term can be 0 (falsy), so we check explicitly for undefined/null
        const hasPaymentTerm = data.payment_term !== undefined && data.payment_term !== null;
        ctx.log?.info({ 
          payment_term: data.payment_term, 
          hasPaymentTerm,
          payment_term_type: typeof data.payment_term,
          hasRepository: !!this.tenantPaymentLogRepository 
        }, "TenantUsecase.createTenant - checking payment log creation");
        
        if (hasPaymentTerm && this.tenantPaymentLogRepository) {
          // Normalize payment_term to number (handle string "0" or "1")
          const paymentTerm = typeof data.payment_term === 'string' ? parseInt(data.payment_term, 10) : data.payment_term;
          
          if (paymentTerm !== 0 && paymentTerm !== 1) {
            throw new Error(`Invalid payment_term: ${data.payment_term}. Must be 0 (year) or 1 (month)`);
          }
          
          ctx.log?.info({ payment_term: paymentTerm }, "TenantUsecase.createTenant - creating payment logs");
          const contractBeginDate = moment(data.contract_begin_at).tz("Asia/Jakarta");
          let numberOfLogs;
          let paymentAmount;
          let dateUnit; // 'years' or 'months'
          
          if (paymentTerm === 0) {
            // Payment term is in years
            // Convert rent_duration to years if needed
            // rent_duration_unit is now an integer (0 = year, 1 = month)
            let rentDurationInYears;
            if (rentDurationUnitInt === DurationUnit.year || rentDurationUnitInt === 0) {
              rentDurationInYears = data.rent_duration; // Already in years
            } else {
              rentDurationInYears = Math.floor(data.rent_duration / 12); // Convert months to years
            }
            
            numberOfLogs = rentDurationInYears; // 1 payment per year
            paymentAmount = (tenant.rent_price - tenant.down_payment) / numberOfLogs;
            dateUnit = 'years';
          } else if (paymentTerm === 1) {
            // Payment term is in months
            // Convert rent_duration to months if needed
            // rent_duration_unit is now an integer (0 = year, 1 = month)
            let rentDurationInMonths;
            if (rentDurationUnitInt === DurationUnit.year || rentDurationUnitInt === 0) {
              rentDurationInMonths = data.rent_duration * 12;
            } else {
              rentDurationInMonths = data.rent_duration;
            }
            
            numberOfLogs = rentDurationInMonths; // 1 payment per month
            paymentAmount = (tenant.rent_price - tenant.down_payment) / numberOfLogs;
            dateUnit = 'months';
          } else {
            // Invalid payment_term value
            throw new Error('payment_term must be 0 (year) or 1 (month)');
          }
          
          ctx.log?.info({ 
            numberOfLogs, 
            paymentAmount, 
            dateUnit,
            rentDurationUnitInt 
          }, "TenantUsecase.createTenant - payment log calculation");
          
          if (numberOfLogs > 0) {
            ctx.log?.info({ numberOfLogs }, "TenantUsecase.createTenant - creating payment logs");
            // Create payment logs
            for (let i = 0; i < numberOfLogs; i++) {
              const paymentDeadline = moment(contractBeginDate).add(i, dateUnit);
              
              const paymentLogData = {
                tenant_id: tenant.id,
                amount: paymentAmount,
                paid_amount: null, // Will be filled when payment is made
                payment_date: null,
                payment_deadline: paymentDeadline.toDate(),
                payment_method: 'other', // Default payment method, can be updated later
                status: 0, // Default status: 0 = unpaid
                notes: `Payment ${i + 1} of ${numberOfLogs}`,
                created_by: ctx.userId,
                updated_by: ctx.userId,
              };
              
              await this.tenantPaymentLogRepository.create(paymentLogData, { ...ctx, transaction: t }, t);
            }
          }
        }
        
        return this.tenantToJson(tenant);
      });

      return result;
    } catch (error) {
      ctx.log?.error(data, "TenantUsecase.create_error");
      throw new Error(`error create tenant. with err: ${error.message}`);
    }
  }

  async saveTenantUnits(tenant, data, t, ctx) {
    ctx.log?.info({ unit_ids: data }, "TenantUsecase.saveTenantUnits");
    const { UnitStatusStrToInt } = require("../models/Unit");
    
    for (let i = 0; i < data.length; i++) {
      let dataUnit = {
        tenant_id: tenant.id,
        unit_id: data[i],
      };

      await this.tenantUnitRepository.create(dataUnit, t, ctx);
      
      // Update unit status to 'occupied' when tenant is created
      ctx.log?.info({ unit_id: data[i], status: UnitStatusStrToInt['occupied'] }, "TenantUsecase.saveTenantUnits - updating unit status to occupied");
      const updateCtx = { ...ctx, transaction: t };
      const updatedUnit = await this.unitRepository.update(data[i], {
        status: UnitStatusStrToInt['occupied'], // 1 = occupied
        updated_by: ctx.userId,
      }, updateCtx);
      
      ctx.log?.info({ unit_id: data[i], updated: !!updatedUnit }, "TenantUsecase.saveTenantUnits - unit status updated");
    }
  }

  async saveCategories(tenant, data, createdBy, tx, ctx) {
    ctx.log?.info({ tenant_id: tenant.id }, "TenantUsecase.saveCategories");
    for (let i = 0; i < data.length; i++) {
      let dataCategories = {
        tenant_id: tenant.id,
        status: 1,
        category_id: data[i],
        created_by: createdBy,
      };

      await this.tenantCategoryMapRepo.create(dataCategories, tx, ctx);
    }
  }

  async saveTenantAttachments(tenant, data, type, tx, ctx) {
    ctx.log?.info(
      { tenant_id: tenant.id, attachment_type: AttachmentType[type] },
      "TenantUsecase.saveTenantAttachments"
    );
    for (let i = 0; i < data.length; i++) {
      let attachmentType = AttachmentType[type];
      let dataAttachment = {
        tenant_id: tenant.id,
        url: data[i],
        status: 1,
        attachment_type: attachmentType,
      };

      await this.tenantAttachmentRepository.create(dataAttachment, tx, ctx);
    }
  }

  calculateDueDate(beginDate, rent_duration, rent_unit) {
    let endDate = moment(beginDate).tz("Asia/Jakarta");
    if (rent_unit == "year") {
      endDate.add(rent_duration, "years");
    } else {
      endDate.add(rent_duration, "months");
    }

    return endDate;
  }

  generateCode() {
    return `${PrefixTenant}-${moment().local().format("DDMMYYYYHHmmss")}`;
  }

  /**
   * Convert tenant status from string or integer to integer
   * @param {string|number|undefined} status - Status value (string like 'active' or integer like 1)
   * @returns {number|undefined} Integer status value or undefined if invalid/not provided
   */
  getTenantStatusInt(status) {
    if (status === undefined || status === null) {
      return undefined;
    }
    
    if (typeof status === 'number') {
      // Validate integer status (0-5)
      if (status >= 0 && status <= 5) {
        return status;
      }
      return undefined;
    }
    
    if (typeof status === 'string') {
      // Try to parse as integer first
      const parsedInt = parseInt(status, 10);
      if (!isNaN(parsedInt) && parsedInt >= 0 && parsedInt <= 5) {
        return parsedInt;
      }
      // Try to convert from string status
      return TenantStatusStrToInt[status];
    }
    
    return undefined;
  }

  async getTenantById(id, ctx) {
    try {
      ctx.log?.info({ tenant_id: id }, "TenantUsecase.getTenantById");
      const tenant = await this.tenantRepository.findById(id, ctx);

      if (tenant) {
        const tenantUnits = await this.tenantUnitRepository.getByTenantID(
          tenant.id
        );

        if (tenantUnits.length > 0) {
          let units = [];
          for (let i = 0; i < tenantUnits.length; i++) {
            let unit = await this.unitRepository.findById(
              tenantUnits[i].unit_id
            );
            units.push(unit);
          }

          tenant.units = units;
        }

        const attachments = await this.tenantAttachmentRepository.getByTenantID(
          tenant.id
        );
        if (attachments.length > 0) {
          let idAttachments = [];
          let contractAttachments = [];
          for (let i = 0; i < attachments.length; i++) {
            if (attachments[i].attachment_type == AttachmentType["id"]) {
              idAttachments.push(attachments[i].url);
            } else {
              contractAttachments.push(attachments[i].url);
            }
          }

          tenant.tenant_identifications = transformImageUrls(idAttachments);
          tenant.contract_documents = transformImageUrls(contractAttachments);
        }

        // Category is now included via association in repository
        if (tenant.category) {
          tenant.category = tenant.category;
        }
      }

      tenant.status = TenantStatusIntToStr[tenant.status];
      
      // Convert rent_duration_unit to string: 0 = year, 1 = month
      if (tenant.rent_duration_unit !== undefined && tenant.rent_duration_unit !== null) {
        tenant.rent_duration_unit = DurationUnitStr[tenant.rent_duration_unit] || tenant.rent_duration_unit;
      }

      return tenant;
    } catch (error) {
      ctx.log?.error({tenant_id: id}, `TenantUsecase.getTenantById_error: ${error.message}`);
      throw error
    }
  }

  async getAllTenants(filter = {}, ctx) {
    try {
      ctx.log?.info(filter, "TenantUsecase.getAllTenants");
      const data = await this.tenantRepository.findAll(filter, ctx);

      // Process each tenant to include attachments, units, and categories
      const processedTenants = await Promise.all(
        data.tenants.map(async (tenant) => {
          // Get tenant units
          const tenantUnits = await this.tenantUnitRepository.getByTenantID(
            tenant.id
          );
          if (tenantUnits.length > 0) {
            let units = [];
            for (let i = 0; i < tenantUnits.length; i++) {
              let unit = await this.unitRepository.findById(
                tenantUnits[i].unit_id
              );
              // Transform unit photos if they exist
              if (unit && unit.photos) {
                unit.photos = transformImageUrls(unit.photos);
              }
              units.push(unit);
            }
            tenant.units = units;
          }

          // Get tenant attachments
          const attachments =
            await this.tenantAttachmentRepository.getByTenantID(tenant.id);
          if (attachments.length > 0) {
            let idAttachments = [];
            let contractAttachments = [];
            for (let i = 0; i < attachments.length; i++) {
              if (attachments[i].attachment_type == AttachmentType["id"]) {
                idAttachments.push(attachments[i].url);
              } else {
                contractAttachments.push(attachments[i].url);
              }
            }

            tenant.tenant_identifications = transformImageUrls(idAttachments);
            tenant.contract_documents = transformImageUrls(contractAttachments);
          }

          // Category is now included via association in repository
          // No need to fetch separately

          // Convert status to string
          tenant.status = TenantStatusIntToStr[tenant.status];
          
          // Convert rent_duration_unit to string: 0 = year, 1 = month
          if (tenant.rent_duration_unit !== undefined && tenant.rent_duration_unit !== null) {
            tenant.rent_duration_unit = DurationUnitStr[tenant.rent_duration_unit] || tenant.rent_duration_unit;
          }

          return tenant;
        })
      );

      return {
        tenants: processedTenants,
        total: data.total,
      };
    } catch (error) {
      ctx.log?.error(filter, "TenantUsecase.getAllTenants_error");
      throw new Error(`error get tenants. with err: ${error.message}`);
    }
  }

  async updateTenant(id, data, ctx) {
    try {
      ctx.log?.info({ tenant_id: id, update_data: data }, "TenantUsecase.updateTenant");
      
      // Get old data before update
      const oldTenant = await this.tenantRepository.findById(id, ctx);
      if (!oldTenant) {
        throw new Error('Tenant not found');
      }

      // Update tenant
      const updatedTenant = await this.tenantRepository.update(id, data);
      
      // Create log entry - only log changed fields
      const changedFields = {};
      const oldData = {};
      
      // Check each field for changes
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
          let hasChanged = false;
          if (key === 'status') {
            // Compare status: convert oldTenant status (integer) to string for comparison
            const oldStatusStr = TenantStatusIntToStr[oldTenant[key]] || String(oldTenant[key]);
            hasChanged = data[key] !== oldStatusStr;
            if (hasChanged) {
              oldData[key] = oldStatusStr;
              changedFields[key] = data[key];
            }
          } else if (key === 'rent_duration_unit') {
            // Compare rent_duration_unit: convert oldTenant (integer) to string for comparison
            const oldUnitStr = DurationUnitStr[oldTenant[key]];
            const newUnitStr = typeof data[key] === 'string' ? data[key] : DurationUnitStr[data[key]];
            hasChanged = newUnitStr !== oldUnitStr;
            if (hasChanged) {
              oldData[key] = oldUnitStr;
              changedFields[key] = newUnitStr;
            }
          } else {
            hasChanged = data[key] !== oldTenant[key];
            if (hasChanged) {
              oldData[key] = oldTenant[key];
              changedFields[key] = data[key];
            }
          }
        }
      });

      // Only create log if there are actual changes
      if (Object.keys(changedFields).length > 0) {
        const tenantLog = {
          tenant_id: id,
          action: 'UPDATE',
          old_data: oldData,
          new_data: changedFields,
          created_by: ctx.userId,
        };

        await this.tenantLogRepository.create(tenantLog, ctx);
      }
      
      // Create deposito log if deposit changed
      if (data.deposit !== undefined && data.deposit !== oldTenant.deposit) {
        const depositoLog = {
          tenant_id: id,
          old_deposit: oldTenant.deposit,
          new_deposit: data.deposit,
          reason: data.deposit_reason || null,
          created_by: ctx.userId,
        };
        await this.depositoLogRepository.create(depositoLog, ctx);
      }
      
      return updatedTenant;
    } catch (error) {
      ctx.log?.error({ tenant_id: id, update_data: data }, `TenantUsecase.updateTenant_error: ${error.message}`);
      throw error;
    }
  }

  async deleteTenant(id, ctx) {
    const transaction = await sequelize.transaction();
    try {
      ctx.log?.info({ tenant_id: id }, "TenantUsecase.deleteTenant");
      
      // Get tenant data before delete
      const tenant = await this.tenantRepository.findById(id, ctx);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Create log entry before deletion - only store essential data
      const tenantLog = {
        tenant_id: id,
        action: 'DELETE',
        old_data: {
          name: tenant.name,
          code: tenant.code,
          status: TenantStatusIntToStr[tenant.status], // Convert to string for log
        },
        new_data: null,
        created_by: ctx.userId,
      };

      await this.tenantLogRepository.create(tenantLog, { ...ctx, transaction });
      
      // Get tenant units before deleting to update their status
      const tenantUnits = await this.tenantUnitRepository.getByTenantID(id);
      
      // Delete related data first
      // Delete tenant units
      await this.tenantUnitRepository.deleteByTenantId(id, { ...ctx, transaction });
      
      // Update unit status back to 'available' when tenant is deleted
      const { UnitStatusStrToInt } = require("../models/Unit");
      if (tenantUnits && tenantUnits.length > 0) {
        for (let i = 0; i < tenantUnits.length; i++) {
          await this.unitRepository.update(tenantUnits[i].unit_id, {
            status: UnitStatusStrToInt['available'], // 0 = available
            updated_by: ctx.userId,
          }, { ...ctx, transaction });
        }
      }
      
      // Delete tenant attachments
      await this.tenantAttachmentRepository.deleteByTenantId(id, { ...ctx, transaction });
      
      // Category is now stored directly in tenant, no need to delete mappings
      
      // Delete tenant
      const result = await this.tenantRepository.delete(id, { ...ctx, transaction });
      
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      ctx.log?.error({ tenant_id: id }, `TenantUsecase.deleteTenant_error: ${error.message}`);
      throw error;
    }
  }

  async getTenantLogs(id, ctx) {
    ctx.log?.info({ tenant_id: id }, "TenantUsecase.getTenantLogs");
    let tenantLogs = await this.tenantLogRepository.findByTenantID(id, ctx);
    return tenantLogs;
  }

  async getDepositoLogs(id, ctx) {
    try {
      ctx.log?.info({ tenant_id: id }, "TenantUsecase.getDepositoLogs");
      const depositoLogs = await this.depositoLogRepository.findByTenantId(id, ctx);
      return depositoLogs;
    } catch (error) {
      ctx.log?.error({ tenant_id: id, error: error.message }, "TenantUsecase.getDepositoLogs_error");
      throw error;
    }
  }

  async tenantToJson(tenant) {
    const tenantObject = await tenant;
    return {
      id: tenantObject.id,
      created_at: moment(tenantObject.created_at).local().format(dateFormat),
      updated_at: moment(tenantObject.updated_at).local().format(dateFormat),
      name: tenantObject.name,
      user_id: tenantObject.user_id,
      contract_begin_at: moment(tenantObject.contract_begin_at)
        .local()
        .format(dateFormat),
      contract_end_at: moment(tenantObject.contract_end_at)
        .local()
        .format(dateFormat),
      status: tenantObject.status,
      code: tenantObject.code,
      rent_duration: tenantObject.rent_duration,
      rent_duration_unit: DurationUnitStr[tenantObject.rent_duration_unit],
      created_by: tenantObject.created_by,
    };
  }
}

module.exports = TenantUseCase;
