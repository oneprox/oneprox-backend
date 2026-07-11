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
    tenantAssetRepository,
    tenantCategoryMapRepo,
    tenantCategoryRepo,
    unitRepository,
    assetRepository,
    tenantLogRepository,
    depositoLogRepository,
    userUsecase,
    tenantPaymentLogRepository,
    tenantLegalRepository,
    settingsRepository
  ) {
    this.tenantRepository = tenantRepository;
    this.tenantAttachmentRepository = tenantAttachmentRepository;
    this.tenantUnitRepository = tenantUnitRepository;
    this.tenantAssetRepository = tenantAssetRepository;
    this.tenantCategoryMapRepo = tenantCategoryMapRepo;
    this.tenantCategoryRepo = tenantCategoryRepo;
    this.unitRepository = unitRepository;
    this.assetRepository = assetRepository;
    this.tenantLogRepository = tenantLogRepository;
    this.depositoLogRepository = depositoLogRepository;
    this.userUsecase = userUsecase;
    this.tenantPaymentLogRepository = tenantPaymentLogRepository;
    this.tenantLegalRepository = tenantLegalRepository;
    this.settingsRepository = settingsRepository;
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
        
        // Handle category: find or create category by name
        let categoryId = null;
        if (data.category && typeof data.category === 'string' && data.category.trim()) {
          ctx.log?.info({ category: data.category }, "TenantUsecase.createTenant - processing category");
          let category = await this.tenantCategoryRepo.findByName(data.category.trim(), ctx);
          if (!category) {
            // Create new category
            ctx.log?.info({ category: data.category }, "TenantUsecase.createTenant - creating new category");
            category = await this.tenantCategoryRepo.create({
              name: data.category.trim(),
              created_by: ctx.userId,
              updated_by: ctx.userId,
            }, ctx, t);
          }
          categoryId = category.id;
          ctx.log?.info({ category_id: categoryId }, "TenantUsecase.createTenant - category resolved");
        }
        
        // Calculate rent_duration and rent_duration_unit from contract dates for backward compatibility
        // These are still required by the database model
        const contractBegin = moment(data.contract_begin_at);
        const contractEnd = moment(data.contract_end_at);
        const durationInMonths = contractEnd.diff(contractBegin, 'months', true);
        const durationInYears = contractEnd.diff(contractBegin, 'years', true);
        
        let rentDuration;
        let rentDurationUnitInt;
        
        // Use years if duration is >= 1 year, otherwise use months
        // rent_duration is INTEGER in DB — must not store fractional years
        if (durationInYears >= 1) {
          rentDuration = Math.max(1, Math.round(durationInYears));
          rentDurationUnitInt = DurationUnit.year; // 0
        } else {
          rentDuration = Math.round(durationInMonths);
          rentDurationUnitInt = DurationUnit.month; // 1
        }
        
        ctx.log?.info({ 
          contract_begin_at: data.contract_begin_at,
          contract_end_at: data.contract_end_at,
          rent_duration: rentDuration,
          rent_duration_unit: rentDurationUnitInt
        }, "TenantUsecase.createTenant - calculated rent duration");
        
        const { normalizeTenantPricing } = require('../utils/tenantPricing');
        const pricing = normalizeTenantPricing({
          rent_price: data.rent_price,
          ppn: data.ppn,
        });

        const createTenantData = {
          user_id: data.user_id,
          name: data.name,
          contract_begin_at: data.contract_begin_at,
          contract_end_at: data.contract_end_at,
          code: this.generateCode(),
          created_by: data.createdBy,
          rent_duration: rentDuration,
          rent_duration_unit: rentDurationUnitInt,
          payment_term: data.payment_term !== undefined ? data.payment_term : null,
          rent_price: pricing.rent_price || null,
          ppn: pricing.ppn,
          total_price: pricing.total_price,
          down_payment: null, // Removed field
          deposit: null, // Removed field
          building_area: data.building_area || null,
          land_area: data.land_area || null,
          electricity_power: data.electricity_power || null,
          category_id: categoryId,
          bank_id: data.bank_id !== undefined && data.bank_id !== null && data.bank_id !== ''
            ? data.bank_id
            : null,
          sub_category: data.sub_category && typeof data.sub_category === 'string' ? data.sub_category.trim() : null,
          status: this.getTenantStatusInt(data.status) ?? 1, // Default to active (1)
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
          
          // Save units or assets based on building_type
          if (data.building_type === 'unit' && data.unit_ids && Array.isArray(data.unit_ids) && data.unit_ids.length > 0) {
            await this.saveTenantUnits(tenant, data.unit_ids, t, ctx);
          } else if (data.building_type === 'asset' && data.asset_ids && Array.isArray(data.asset_ids) && data.asset_ids.length > 0) {
            await this.saveTenantAssets(tenant, data.asset_ids, t, ctx);
          }
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
            ppn: tenant.ppn,
            total_price: tenant.total_price,
            category: data.category || null,
            sub_category: data.sub_category || null,
          },
          created_by: ctx.userId,
        };

        await this.tenantLogRepository.create(tenantLog, ctx);
        
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
          const contractEndDate = moment(data.contract_end_at).tz("Asia/Jakarta");
          let numberOfLogs;
          let paymentAmount;
          let dateUnit; // 'years' or 'months'
          
          // Calculate duration from contract dates
          
          if (paymentTerm === 0) {
            // Payment term is in years
            const durationInYears = contractEndDate.diff(contractBeginDate, 'years', true);
            numberOfLogs = Math.max(1, Math.floor(durationInYears)); // At least 1 payment
            paymentAmount = tenant.rent_price ? tenant.rent_price / numberOfLogs : 0;
            dateUnit = 'years';
          } else if (paymentTerm === 1) {
            // Payment term is in months
            const durationInMonths = contractEndDate.diff(contractBeginDate, 'months', true);
            numberOfLogs = Math.max(1, Math.floor(durationInMonths)); // At least 1 payment
            paymentAmount = tenant.rent_price ? tenant.rent_price / numberOfLogs : 0;
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
        
        // Create legal documents automatically from settings
        if (this.tenantLegalRepository && this.settingsRepository) {
          try {
            // NOTE:
            // - "setting-option" disimpan sebagai row di table settings, dengan value = 'legal_doc'
            // - key row tsb jadi identifier/template key (yang nantinya bisa disimpan)
            // - daftar dokumen legal disimpan di description (format JSON array)
            // - Jika ada multiple settings dengan value='legal_doc', kita ambil semua
            const legalDocSettings = await this.settingsRepository.findAllByValue('legal_doc', ctx);
            
            if (legalDocSettings && legalDocSettings.length > 0) {
              ctx.log?.info(
                { count: legalDocSettings.length },
                "TenantUsecase.createTenant - found legal_doc setting options"
              );
              
              let totalCreated = 0;
              
              // Process each setting with value='legal_doc'
              for (const legalDocSetting of legalDocSettings) {
                try {
                  // Parse description (expecting JSON array)
                  let legalDocs = [];
                  
                  if (legalDocSetting.description && String(legalDocSetting.description).trim()) {
                    try {
                      const jsonString = String(legalDocSetting.description).trim();
                      const parsed = JSON.parse(jsonString);
                      
                      if (Array.isArray(parsed)) {
                        legalDocs = parsed;
                      } else if (typeof parsed === 'object' && parsed !== null) {
                        // If single object, wrap in array
                        legalDocs = [parsed];
                      } else {
                        // If string, treat as single doc_type
                        legalDocs = [{ doc_type: parsed }];
                      }
                    } catch (parseError) {
                      ctx.log?.warn(
                        { 
                          setting_key: legalDocSetting.key, 
                          description: legalDocSetting.description, 
                          error: parseError.message 
                        },
                        "TenantUsecase.createTenant - failed to parse legal_doc description, trying key as doc_type"
                      );
                      // Fallback: use key as doc_type if description parsing fails
                      if (legalDocSetting.key) {
                        legalDocs = [{ doc_type: String(legalDocSetting.key) }];
                      }
                    }
                  } else {
                    // If description is empty, use key as doc_type
                    if (legalDocSetting.key) {
                      legalDocs = [{ doc_type: String(legalDocSetting.key) }];
                    }
                  }
                  
                  // Create legal documents for each item
                  if (legalDocs.length > 0) {
                    ctx.log?.info(
                      { setting_key: legalDocSetting.key, count: legalDocs.length }, 
                      "TenantUsecase.createTenant - creating legal documents from setting"
                    );
                    
                    for (const legalDoc of legalDocs) {
                      // Validate required fields - doc_type is required
                      const docType = legalDoc.doc_type || legalDocSetting.key || 'Legal Document';
                      
                      const legalDocData = {
                        tenant_id: tenant.id,
                        doc_type: String(docType),
                        due_date: legalDoc.due_date || null,
                        keterangan: legalDoc.keterangan || null,
                        document_url: legalDoc.document_url || null,
                        status: 'belum_selesai',
                        created_by: ctx.userId,
                        updated_by: ctx.userId,
                      };
                      
                      await this.tenantLegalRepository.create(legalDocData, { ...ctx, transaction: t }, t);
                      totalCreated++;
                      ctx.log?.info(
                        { doc_type: legalDocData.doc_type }, 
                        "TenantUsecase.createTenant - created legal document"
                      );
                    }
                  }
                } catch (settingError) {
                  ctx.log?.error(
                    { 
                      setting_key: legalDocSetting.key, 
                      error: settingError.message,
                      stack: settingError.stack 
                    },
                    "TenantUsecase.createTenant - error processing legal_doc setting"
                  );
                  // Continue with next setting even if one fails
                }
              }
              
              ctx.log?.info(
                { total_created: totalCreated },
                "TenantUsecase.createTenant - completed creating legal documents"
              );
            } else {
              ctx.log?.warn({}, "TenantUsecase.createTenant - no legal_doc setting found");
            }
          } catch (legalError) {
            // Log error but don't fail tenant creation
            ctx.log?.error(
              { 
                error: legalError.message,
                stack: legalError.stack 
              }, 
              "TenantUsecase.createTenant - error creating legal documents"
            );
            console.error("Error creating legal documents:", legalError);
          }
        } else {
          ctx.log?.warn(
            { 
              has_tenantLegalRepository: !!this.tenantLegalRepository,
              has_settingsRepository: !!this.settingsRepository
            },
            "TenantUsecase.createTenant - repositories not available for legal documents"
          );
        }
        
        return this.tenantToJson(tenant);
      });

      return result;
    } catch (error) {
      ctx.log?.error(data, "TenantUsecase.create_error");
      throw new Error(`error create tenant. with err: ${error.message}`);
    }
  }

  isTenantStatusActive(status) {
    if (status === undefined || status === null) return false;
    if (typeof status === 'string') {
      return TenantStatusStrToInt[status] === 1;
    }
    return Number(status) === 1;
  }

  resolveTenantStatusInt(status) {
    if (status === undefined || status === null) return undefined;
    if (typeof status === 'number') return status;
    if (typeof status === 'string') {
      const parsed = parseInt(status, 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 5) return parsed;
      return TenantStatusStrToInt[status];
    }
    return undefined;
  }

  /**
   * Pastikan unit/asset siap sebelum tenant diaktifkan (status available, tidak dipakai tenant aktif lain).
   */
  async validateResourcesAvailableForActivation(tenantId, ctx, transaction = null) {
    const { UnitStatusStrToInt, UnitStatusIntToStr } = require('../models/Unit');
    const { QueryTypes } = require('sequelize');
    const sequelizeInstance = this.tenantUnitRepository.tenantUnitModel.sequelize;
    const tx = transaction || ctx.transaction || null;

    const unitIssues = [];
    const assetIssues = [];

    const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenantId, tx);
    for (const tu of tenantUnits) {
      const unitId = tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id;
      if (!unitId) continue;

      const unit = await this.unitRepository.findById(unitId, ctx);
      const unitName = unit?.name || unitId;

      const otherHoldingTenantId = await this.tenantUnitRepository.findHoldingTenantIdByUnitId(
        unitId,
        tenantId
      );
      if (otherHoldingTenantId) {
        let otherName = '';
        try {
          const otherTenant = await this.tenantRepository.findById(otherHoldingTenantId, ctx);
          otherName = otherTenant?.name ? ` (${otherTenant.name})` : '';
        } catch (_) {
          /* ignore */
        }
        unitIssues.push(
          `Unit "${unitName}" masih dipakai tenant lain${otherName}`
        );
        continue;
      }

      if (!unit) {
        unitIssues.push(`Unit "${unitName}" tidak ditemukan`);
        continue;
      }

      let statusInt = unit.status;
      if (typeof statusInt === 'string') {
        statusInt = UnitStatusStrToInt[statusInt];
      }
      // Unit yang sudah ditahan tenant ini boleh occupied/reserved (bukan hanya available).
      const allowedStatuses = [
        UnitStatusStrToInt.available,
        UnitStatusStrToInt.reserved,
        UnitStatusStrToInt.occupied,
      ];
      if (!allowedStatuses.includes(statusInt)) {
        const statusLabel = UnitStatusIntToStr[statusInt] || 'occupied';
        unitIssues.push(
          `Unit "${unitName}" masih berstatus ${statusLabel} (belum available/reserved)`
        );
      }
    }

    const tenantAssets = await this.tenantAssetRepository.getByTenantID(tenantId);
    for (const ta of tenantAssets) {
      const assetId = ta.asset_id || ta.get?.('asset_id') || ta.toJSON?.()?.asset_id;
      if (!assetId) continue;

      const otherActiveTenantId = await this.tenantAssetRepository.findActiveTenantIdByAssetId(
        assetId,
        tenantId
      );
      if (!otherActiveTenantId) continue;

      let assetName = assetId;
      try {
        const rows = await sequelizeInstance.query(
          `SELECT name FROM assets WHERE id = :assetId LIMIT 1`,
          { replacements: { assetId }, type: QueryTypes.SELECT }
        );
        if (rows[0]?.name) assetName = rows[0].name;
      } catch (_) {
        /* ignore */
      }

      let otherName = '';
      try {
        const otherTenant = await this.tenantRepository.findById(otherActiveTenantId, ctx);
        otherName = otherTenant?.name ? ` (${otherTenant.name})` : '';
      } catch (_) {
        /* ignore */
      }

      assetIssues.push(
        `Asset "${assetName}" masih digunakan tenant aktif lain${otherName}`
      );
    }

    if (unitIssues.length === 0 && assetIssues.length === 0) {
      return;
    }

    const parts = [];
    if (unitIssues.length > 0) {
      parts.push(`Unit: ${unitIssues.join('; ')}`);
    }
    if (assetIssues.length > 0) {
      parts.push(`Asset: ${assetIssues.join('; ')}`);
    }

    const err = new Error(
      `Tidak dapat mengaktifkan tenant. ${parts.join(' ')} Bebaskan unit/asset terlebih dahulu atau pilih yang lain.`
    );
    err.statusCode = 400;
    err.code = 'TENANT_RESOURCE_CONFLICT';
    throw err;
  }

  /** Tenant yang masih menahan unit (belum dilepas ke pool available). */
  isTenantStatusHoldingUnits(status) {
    const statusInt = this.resolveTenantStatusInt(status);
    if (statusInt === undefined) return false;
    // inactive(0), terminated(4), blacklisted(5) melepaskan unit
    return [1, 2, 3].includes(statusInt); // active, pending, expired
  }

  /**
   * Unit ditandai reserved (pending) atau occupied (active/expired);
   * hanya inactive/terminated/blacklisted yang mengembalikan unit ke available.
   */
  async syncTenantUnitOccupancy(tenantId, tenantStatus, ctx, transaction = null) {
    const statusInt = this.resolveTenantStatusInt(tenantStatus);
    if (statusInt === undefined) return;

    if (this.isTenantStatusHoldingUnits(statusInt)) {
      if (this.isTenantStatusActive(statusInt)) {
        await this.validateResourcesAvailableForActivation(tenantId, ctx, transaction);
      }
      await this.holdUnitsForTenant(tenantId, statusInt, ctx, transaction);
    } else {
      await this.releaseUnitsForTenant(tenantId, ctx, transaction);
    }
  }

  async releaseUnitsForTenant(tenantId, ctx, transaction = null) {
    const { UnitStatusStrToInt } = require('../models/Unit');
    const tx = transaction || ctx.transaction || null;
    const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenantId, tx);
    const updateCtx = transaction ? { ...ctx, transaction } : ctx;

    for (const tu of tenantUnits) {
      const unitId = tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id;
      if (!unitId) continue;

      const otherActiveTenantId = await this.tenantUnitRepository.findActiveTenantIdByUnitId(
        unitId,
        tenantId
      );
      if (otherActiveTenantId) continue;

      await this.unitRepository.update(
        unitId,
        {
          status: UnitStatusStrToInt.available,
          updated_by: ctx.userId,
        },
        updateCtx
      );
    }
  }

  async holdUnitsForTenant(tenantId, tenantStatusInt, ctx, transaction = null) {
    const { UnitStatusStrToInt } = require('../models/Unit');
    const tx = transaction || ctx.transaction || null;
    const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenantId, tx);
    const updateCtx = transaction ? { ...ctx, transaction } : ctx;
    const unitStatus =
      tenantStatusInt === 2 ? UnitStatusStrToInt.reserved : UnitStatusStrToInt.occupied;

    for (const tu of tenantUnits) {
      const unitId = tu.unit_id || tu.get?.('unit_id') || tu.toJSON?.()?.unit_id;
      if (!unitId) continue;

      await this.unitRepository.update(
        unitId,
        {
          status: unitStatus,
          updated_by: ctx.userId,
        },
        updateCtx
      );
    }
  }

  calculateRentDurationFromContract(contractBeginAt, contractEndAt) {
    const contractBegin = moment(contractBeginAt);
    const contractEnd = moment(contractEndAt);
    const durationInMonths = contractEnd.diff(contractBegin, 'months', true);
    const durationInYears = contractEnd.diff(contractBegin, 'years', true);

    if (durationInYears >= 1) {
      return {
        rent_duration: Math.max(1, Math.round(durationInYears)),
        rent_duration_unit: DurationUnit.year,
      };
    }
    return {
      rent_duration: Math.round(durationInMonths),
      rent_duration_unit: DurationUnit.month,
    };
  }

  async resolveCategoryId(categoryName, ctx, transaction) {
    if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) {
      return null;
    }
    let category = await this.tenantCategoryRepo.findByName(categoryName.trim(), ctx);
    if (!category) {
      category = await this.tenantCategoryRepo.create(
        {
          name: categoryName.trim(),
          created_by: ctx.userId,
          updated_by: ctx.userId,
        },
        ctx,
        transaction
      );
    }
    return category.id;
  }

  async replaceTenantUnits(tenantId, unitIds, tenantStatus, ctx, transaction) {
    const txCtx = { ...ctx, transaction };
    await this.releaseUnitsForTenant(tenantId, txCtx, transaction);
    await this.tenantUnitRepository.deleteByTenantId(tenantId, txCtx);

    if (!Array.isArray(unitIds) || unitIds.length === 0) {
      return;
    }

    for (const unitId of unitIds) {
      const holdingTenantId = await this.tenantUnitRepository.findHoldingTenantIdByUnitId(
        unitId,
        tenantId
      );
      if (holdingTenantId) {
        let otherName = '';
        try {
          const otherTenant = await this.tenantRepository.findById(holdingTenantId, ctx);
          otherName = otherTenant?.name ? ` (${otherTenant.name})` : '';
        } catch (_) {
          /* ignore */
        }
        throw new Error(
          `Unit masih dipakai tenant lain${otherName}. Nonaktifkan/akhiri tenant tersebut atau pilih unit lain.`
        );
      }

      await this.tenantUnitRepository.create(
        { tenant_id: tenantId, unit_id: unitId },
        transaction,
        ctx
      );
    }

    await this.syncTenantUnitOccupancy(tenantId, tenantStatus, ctx, transaction);
  }

  async replaceTenantAssets(tenantId, assetIds, ctx, transaction) {
    const txCtx = { ...ctx, transaction };
    await this.tenantAssetRepository.deleteByTenantId(tenantId, txCtx);

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return;
    }

    for (const assetId of assetIds) {
      const activeTenantId = await this.tenantAssetRepository.findActiveTenantIdByAssetId(
        assetId,
        tenantId
      );
      if (activeTenantId) {
        throw new Error(
          'Asset yang dipilih masih digunakan tenant aktif lain. Nonaktifkan tenant tersebut atau pilih asset lain.'
        );
      }

      await this.tenantAssetRepository.create(
        { tenant_id: tenantId, asset_id: assetId },
        transaction,
        ctx
      );
    }
  }

  async saveTenantUnits(tenant, data, t, ctx) {
    ctx.log?.info({ unit_ids: data }, "TenantUsecase.saveTenantUnits");

    for (let i = 0; i < data.length; i++) {
      const unitId = data[i];
      const holdingTenantId = await this.tenantUnitRepository.findHoldingTenantIdByUnitId(
        unitId,
        tenant.id
      );
      if (holdingTenantId) {
        let otherName = '';
        try {
          const otherTenant = await this.tenantRepository.findById(holdingTenantId, ctx);
          otherName = otherTenant?.name ? ` (${otherTenant.name})` : '';
        } catch (_) {
          /* ignore */
        }
        throw new Error(
          `Unit masih dipakai tenant lain${otherName}. Nonaktifkan/akhiri tenant tersebut atau pilih unit lain.`
        );
      }

      await this.tenantUnitRepository.create(
        {
          tenant_id: tenant.id,
          unit_id: unitId,
        },
        t,
        ctx
      );
    }

    await this.syncTenantUnitOccupancy(tenant.id, tenant.status, ctx, t);
  }

  async saveTenantAssets(tenant, data, t, ctx) {
    ctx.log?.info({ asset_ids: data }, "TenantUsecase.saveTenantAssets");

    for (let i = 0; i < data.length; i++) {
      const assetId = data[i];
      const activeTenantId = await this.tenantAssetRepository.findActiveTenantIdByAssetId(
        assetId,
        tenant.id
      );
      if (activeTenantId) {
        throw new Error(
          'Asset yang dipilih masih digunakan tenant aktif lain. Nonaktifkan tenant tersebut atau pilih asset lain.'
        );
      }

      await this.tenantAssetRepository.create(
        {
          tenant_id: tenant.id,
          asset_id: assetId,
        },
        t,
        ctx
      );
      ctx.log?.info({ asset_id: assetId }, "TenantUsecase.saveTenantAssets - asset linked to tenant");
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

  async replaceTenantAttachments(tenantId, urls, type, tx, ctx) {
    if (!Array.isArray(urls)) return;
    const attachmentType = AttachmentType[type];
    await this.tenantAttachmentRepository.deleteByTenantIdAndType(
      tenantId,
      attachmentType,
      { ...ctx, transaction: tx }
    );
    if (urls.length === 0) return;

    const tenant = { id: tenantId };
    await this.saveTenantAttachments(tenant, urls, type, tx, ctx);
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

  async attachTenantResources(tenant, ctx) {
    const tenantUnits = await this.tenantUnitRepository.getByTenantID(tenant.id);

    if (tenantUnits.length > 0) {
      const units = [];
      for (let i = 0; i < tenantUnits.length; i++) {
        const unit = await this.unitRepository.findById(tenantUnits[i].unit_id);
        if (unit) {
          units.push(unit);
        }
      }

      tenant.units = units;
      tenant.building_type = 'unit';
      return tenant;
    }

    const tenantAssets = await this.tenantAssetRepository.getByTenantID(tenant.id);
    if (tenantAssets.length > 0) {
      const assetIds = tenantAssets
        .map((ta) => ta.asset_id || ta.get?.('asset_id') || ta.toJSON?.()?.asset_id)
        .filter(Boolean);

      const assets = [];
      for (let i = 0; i < assetIds.length; i++) {
        const asset = await this.assetRepository.findById(assetIds[i], ctx);
        if (asset) {
          assets.push(asset);
        }
      }

      tenant.asset_ids = assetIds;
      tenant.assets = assets;
      tenant.building_type = 'asset';
    }

    return tenant;
  }

  async getTenantById(id, ctx) {
    try {
      ctx.log?.info({ tenant_id: id }, "TenantUsecase.getTenantById");
      const tenant = await this.tenantRepository.findById(id, ctx);

      if (tenant) {
        await this.attachTenantResources(tenant, ctx);

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

      if (!tenant) {
        return null;
      }

      tenant.status = TenantStatusIntToStr[tenant.status] ?? tenant.status;
      
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
          await this.attachTenantResources(tenant, ctx);
          if (tenant.units?.length > 0) {
            for (let i = 0; i < tenant.units.length; i++) {
              if (tenant.units[i].photos) {
                tenant.units[i].photos = transformImageUrls(tenant.units[i].photos);
              }
            }
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
          tenant.status = TenantStatusIntToStr[tenant.status] ?? tenant.status;
          
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

      const result = await sequelize.transaction(async (t) => {
        const txCtx = { ...ctx, transaction: t };

        const oldTenant = await this.tenantRepository.findById(id, txCtx);
        if (!oldTenant) {
          throw new Error('Tenant not found');
        }

        const oldStatusInt = this.resolveTenantStatusInt(oldTenant.status);
        const newStatusInt =
          data.status !== undefined
            ? this.resolveTenantStatusInt(data.status)
            : oldStatusInt;

        const activating =
          newStatusInt !== undefined &&
          oldStatusInt !== undefined &&
          !this.isTenantStatusActive(oldStatusInt) &&
          this.isTenantStatusActive(newStatusInt);

        if (activating) {
          await this.validateResourcesAvailableForActivation(id, txCtx, t);
        }

        const updatePayload = {};
        if (data.name !== undefined) updatePayload.name = data.name;
        if (data.user_id !== undefined) updatePayload.user_id = data.user_id;
        if (data.status !== undefined) updatePayload.status = data.status;
        if (data.contract_begin_at !== undefined) {
          updatePayload.contract_begin_at = data.contract_begin_at;
        }
        if (data.contract_end_at !== undefined) {
          updatePayload.contract_end_at = data.contract_end_at;
        }
        if (data.contract_begin_at !== undefined && data.contract_end_at !== undefined) {
          const duration = this.calculateRentDurationFromContract(
            data.contract_begin_at,
            data.contract_end_at
          );
          updatePayload.rent_duration = duration.rent_duration;
          updatePayload.rent_duration_unit = duration.rent_duration_unit;
        }
        if (data.category !== undefined) {
          updatePayload.category_id = await this.resolveCategoryId(data.category, txCtx, t);
        }
        if (data.sub_category !== undefined) {
          updatePayload.sub_category =
            data.sub_category && typeof data.sub_category === 'string'
              ? data.sub_category.trim() || null
              : null;
        }
        if (data.bank_id !== undefined) {
          updatePayload.bank_id =
            data.bank_id === null || data.bank_id === ''
              ? null
              : data.bank_id;
        }
        if (data.payment_term !== undefined) updatePayload.payment_term = data.payment_term;
        if (data.building_area !== undefined) updatePayload.building_area = data.building_area;
        if (data.land_area !== undefined) updatePayload.land_area = data.land_area;
        if (data.electricity_power !== undefined) {
          updatePayload.electricity_power = data.electricity_power;
        }
        if (data.deposit !== undefined) updatePayload.deposit = data.deposit;
        if (data.payment_status !== undefined) updatePayload.payment_status = data.payment_status;
        updatePayload.updated_by = ctx.userId;

        if (data.ppn !== undefined || data.rent_price !== undefined) {
          const { normalizeTenantPricing } = require('../utils/tenantPricing');
          const pricing = normalizeTenantPricing(
            {
              rent_price: data.rent_price,
              ppn: data.ppn,
            },
            oldTenant.rent_price
          );
          updatePayload.ppn = pricing.ppn;
          updatePayload.total_price = pricing.total_price;
          if (data.rent_price !== undefined) {
            updatePayload.rent_price = pricing.rent_price;
          }
        } else if (data.total_price !== undefined) {
          updatePayload.total_price = data.total_price;
        }

        const updatedTenant = await this.tenantRepository.update(id, updatePayload, t);
        if (!updatedTenant) {
          throw new Error('Tenant not found');
        }

        if (data.tenant_identifications !== undefined) {
          await this.replaceTenantAttachments(
            id,
            data.tenant_identifications,
            'id',
            t,
            txCtx
          );
        }
        if (data.contract_documents !== undefined) {
          await this.replaceTenantAttachments(
            id,
            data.contract_documents,
            'contract',
            t,
            txCtx
          );
        }

        const occupancyStatus = newStatusInt ?? oldStatusInt;
        const unitsReplaced =
          data.building_type === 'unit' && data.unit_ids !== undefined;
        const assetsReplaced =
          data.building_type === 'asset' && data.asset_ids !== undefined;

        if (unitsReplaced) {
          await this.replaceTenantUnits(id, data.unit_ids, occupancyStatus, txCtx, t);
          await this.tenantAssetRepository.deleteByTenantId(id, txCtx);
        } else if (assetsReplaced) {
          await this.releaseUnitsForTenant(id, txCtx, t);
          await this.tenantUnitRepository.deleteByTenantId(id, txCtx);
          await this.replaceTenantAssets(id, data.asset_ids, txCtx, t);
        }

        const tenantStatusChanged =
          data.status !== undefined &&
          oldStatusInt !== undefined &&
          newStatusInt !== undefined &&
          oldStatusInt !== newStatusInt;

        // Sinkronkan unit hanya saat status berubah tanpa replace unit/asset
        // (replaceTenantUnits/replaceTenantAssets sudah memanggil syncTenantUnitOccupancy)
        const shouldSyncUnitOccupancy =
          newStatusInt !== undefined &&
          !unitsReplaced &&
          !assetsReplaced &&
          tenantStatusChanged;

        if (shouldSyncUnitOccupancy) {
          await this.syncTenantUnitOccupancy(id, newStatusInt, txCtx, t);
        }

        const loggableKeys = [
          'name',
          'status',
          'rent_price',
          'ppn',
          'total_price',
          'building_area',
          'land_area',
          'electricity_power',
          'deposit',
          'payment_status',
        ];
        const changedFields = {};
        const oldData = {};

        for (const key of loggableKeys) {
          if (data[key] === undefined) continue;
          let hasChanged = false;
          if (key === 'status') {
            const oldStatusStr =
              TenantStatusIntToStr[oldTenant.status] || String(oldTenant.status);
            hasChanged = data[key] !== oldStatusStr;
            if (hasChanged) {
              oldData[key] = oldStatusStr;
              changedFields[key] = data[key];
            }
          } else {
            hasChanged = data[key] !== oldTenant[key];
            if (hasChanged) {
              oldData[key] = oldTenant[key];
              changedFields[key] = data[key];
            }
          }
        }

        if (data.tenant_identifications !== undefined) {
          changedFields.tenant_identifications = data.tenant_identifications;
        }
        if (data.contract_documents !== undefined) {
          changedFields.contract_documents = data.contract_documents;
        }

        if (Object.keys(changedFields).length > 0) {
          await this.tenantLogRepository.create(
            {
              tenant_id: id,
              action: 'UPDATE',
              old_data: oldData,
              new_data: changedFields,
              created_by: ctx.userId,
            },
            txCtx
          );
        }

        return updatedTenant;
      });

      return result;
    } catch (error) {
      ctx.log?.error(
        { tenant_id: id, update_data: data },
        `TenantUsecase.updateTenant_error: ${error.message}`
      );
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
      
      // Bebaskan unit sebelum hapus relasi tenant_units (release butuh baris tenant_units)
      await this.releaseUnitsForTenant(id, { ...ctx, transaction });

      // Delete related data first
      await this.tenantUnitRepository.deleteByTenantId(id, { ...ctx, transaction });
      await this.tenantAssetRepository.deleteByTenantId(id, { ...ctx, transaction });
      
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
