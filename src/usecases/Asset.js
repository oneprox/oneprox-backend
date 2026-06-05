const sequelize = require("../models/sequelize");
const { AttachmentType } = require("../models/AssetAttachment");
const moment = require("moment");
const PrefixAsset = "ASSET";

const { AssetStatusIntToStr, AssetTypeIntToStr } = require('../models/Asset');
const { transformImageUrls } = require('../services/baseUrl');

class AssetUsecase {
  constructor(
    assetRepository,
    assetLogRepository,
    assetAttachmentRepository,
    unitRepository,
    tenantAssetRepository
  ) {
    this.assetRepository = assetRepository;
    this.assetLogRepository = assetLogRepository;
    this.assetAttachmentRepository = assetAttachmentRepository;
    this.unitRepository = unitRepository;
    this.tenantAssetRepository = tenantAssetRepository;
  }

  formatLinkedTenantNames(tenants) {
    const unique = new Map();
    for (const t of tenants) {
      unique.set(t.id, t.name || t.code || t.id);
    }
    return [...unique.values()].join(', ');
  }

  async assertAssetNotLinkedToTenant(assetId) {
    const [directLinks, unitLinks] = await Promise.all([
      this.tenantAssetRepository.findLinkedTenantsByAssetId(assetId),
      this.tenantAssetRepository.findLinkedTenantsByAssetUnits(assetId),
    ]);
    const linked = [...directLinks, ...unitLinks];
    if (linked.length === 0) return;

    const err = new Error(
      `Asset tidak dapat dihapus karena masih terhubung ke tenant: ${this.formatLinkedTenantNames(linked)}. Hapus tenant terlebih dahulu.`
    );
    err.statusCode = 400;
    err.code = 'ASSET_LINKED_TO_TENANT';
    throw err;
  }

  async createAsset(data, ctx) {
    try {
      const result = await sequelize.transaction(async (t) => {
        const createAssetData = {
          name: data.name,
          description: data.description,
          asset_type: data.asset_type,
          status: data.status,
          code: data.code || this.generateCode(),
          is_deleted: data.is_deleted,
          address: data.address,
          area: data.area,
          latitude: data.latitude,
          longitude: data.longitude,
          created_by: ctx.userID,
        };
        const asset = await this.assetRepository.create(
          createAssetData,
          ctx,
          t
        );
        if (asset) {
          if (ctx.roleName === "admin") {
            await this.assetRepository.assignAdmin(
              asset.id,
              ctx.userID,
              ctx,
              t
            );
          }
          if (data.sketch) {
            await this.createAttachment(asset.id, [data.sketch], "sketch", t);
          }
          if (data.photos) {
            await this.createAttachment(asset.id, data.photos, "photo", t);
          }
          // Create log entry - only store essential data
          const assetLog = {
            asset_id: asset.id,
            action: 'CREATE',
            old_data: null,
            new_data: {
              name: asset.name,
              code: asset.code,
              status: AssetStatusIntToStr[asset.status],
              asset_type: AssetTypeIntToStr[asset.asset_type],
            },
            created_by: ctx.userID,
          };

          await this.assetLogRepository.create(assetLog, { ...ctx, transaction: t });
        }

        asset.asset_type = AssetTypeIntToStr[asset.asset_type];
        asset.status = AssetStatusIntToStr[asset.status];

        return asset;
      });

      return result;
    } catch (error) {
      ctx.log?.error(
        { name: data.name, error: error.message },
        "AssetUsecase.error"
      );
      throw new Error(error.message);
    }
  }

  generateCode() {
    return `${PrefixAsset}-${moment().local().format('DDMMYYYYHHmmss')}`
  }

  async createAttachment(assetId, data, type, trx) {
    for (let i = 0; i < data.length; i++) {
      const attachmentData = {
        asset_id: assetId,
        url: data[i],
        attachment_type: AttachmentType[type],
      };

      await this.assetAttachmentRepository.create(attachmentData, trx);
    }
  }

  async listAssets(queryParams, ctx) {
    const data = await this.assetRepository.listAll(queryParams, ctx);
    data.assets.map(a => {
      a.asset_type = AssetTypeIntToStr[a.asset_type];
      a.status = AssetStatusIntToStr[a.status];
      return a
    })
    
    // Get unit counts per asset
    const assetIds = data.assets.map(a => a.id);
    const unitCountMap = await this.unitRepository.countByAssetIds(assetIds, ctx);
    
    // Add total_units to each asset
    data.assets.forEach(asset => {
      asset.total_units = unitCountMap[asset.id] || 0;
    });
    
    return data

    
  }

  async getAsset(id, ctx) {
    const asset = await this.assetRepository.findById(id, ctx);
    if (!asset) return null;
    
    const attachments = await this.assetAttachmentRepository.getByAssetID(
      asset.id
    );
    if (attachments.length < 1) {
      return asset;
    }
    let sketchs = [];
    let photos = [];
    for (let i = 0; i < attachments.length; i++) {
      switch (attachments[i].attachment_type) {
        case AttachmentType["photo"]:
          photos.push(attachments[i].url);
          break;
        case AttachmentType["sketch"]:
          sketchs.push(attachments[i].url);
          break;
        default:
          break;
      }
    }

    asset.photos = transformImageUrls(photos);
    asset.sketch = transformImageUrls(sketchs);
    asset.asset_type = AssetTypeIntToStr[asset.asset_type];
        asset.status = AssetStatusIntToStr[asset.status];
    return asset;
  }

  async updateAsset(id, data, ctx) {
    const result = await sequelize.transaction(async (t) => {
      const originalAsset = await this.assetRepository.findById(id, ctx);
      if (!originalAsset) return null;
      
      // Get original attachments BEFORE any changes for logging
      const originalAttachments = await this.assetAttachmentRepository.getByAssetID(originalAsset.id);
      const oldPhotos = originalAttachments
        .filter(att => att.attachment_type === AttachmentType["photo"])
        .map(att => att.url);
      const oldSketches = originalAttachments
        .filter(att => att.attachment_type === AttachmentType["sketch"])
        .map(att => att.url);
      
      // Handle photos and sketch attachments
      // Only process if photos/sketches are explicitly provided in the request
      // If photos/sketches fields are not in data, skip attachment processing entirely
      // Use 'in' operator which is safer than hasOwnProperty
      const hasPhotoChanges = data && ('photos' in data || 'existing_photos' in data);
      const hasSketchChanges = data && ('sketches' in data || 'sketch' in data || 'existing_sketches' in data);
      
      if (hasPhotoChanges || hasSketchChanges) {
        // Use originalAttachments for processing
        const existingAttachments = originalAttachments;
        
        // Handle photos: compare existing with what should be kept
        if (hasPhotoChanges) {
          const existingPhotos = existingAttachments.filter(att => att.attachment_type === AttachmentType["photo"]);
          
          // If existing_photos is provided, use it to determine what to keep
          // If not provided but new photos are uploaded, keep all existing and add new ones
          if (data && 'existing_photos' in data) {
            const photosToKeep = data.existing_photos || [];
            
            // Delete photos that are not in the "keep" list
            for (const existingPhoto of existingPhotos) {
              const shouldKeep = photosToKeep.some(url => {
                // Compare URLs - handle both full URLs and relative paths
                const existingUrl = existingPhoto.url;
                const keepUrl = url;
                // Normalize URLs for comparison (remove protocol/host if present)
                const normalizeUrl = (u) => {
                  if (!u) return '';
                  const match = u.match(/\/uploads\/.*/);
                  return match ? match[0] : u;
                };
                return normalizeUrl(existingUrl) === normalizeUrl(keepUrl) || existingUrl === keepUrl;
              });
              
              if (!shouldKeep) {
                await this.assetAttachmentRepository.delete(existingPhoto.id, { ...ctx, transaction: t });
              }
            }
          }
          
          // Create new photos from uploaded files
          if (data.photos && data.photos.length > 0) {
            await this.createAttachment(originalAsset.id, data.photos, "photo", t);
          }
        }
        
        // Handle sketches: compare existing with what should be kept
        if (hasSketchChanges) {
          const existingSketches = existingAttachments.filter(att => att.attachment_type === AttachmentType["sketch"]);
          
          // If existing_sketches is provided, use it to determine what to keep
          // If not provided but new sketches are uploaded, keep all existing and add new ones
          if (data && 'existing_sketches' in data) {
            const sketchesToKeep = data.existing_sketches || [];
            
            // Delete sketches that are not in the "keep" list
            for (const existingSketch of existingSketches) {
              const shouldKeep = sketchesToKeep.some(url => {
                // Compare URLs - handle both full URLs and relative paths
                const existingUrl = existingSketch.url;
                const keepUrl = url;
                // Normalize URLs for comparison (remove protocol/host if present)
                const normalizeUrl = (u) => {
                  if (!u) return '';
                  const match = u.match(/\/uploads\/.*/);
                  return match ? match[0] : u;
                };
                return normalizeUrl(existingUrl) === normalizeUrl(keepUrl) || existingUrl === keepUrl;
              });
              
              if (!shouldKeep) {
                await this.assetAttachmentRepository.delete(existingSketch.id, { ...ctx, transaction: t });
              }
            }
          }
          
          // Create new sketches from uploaded files
          const newSketches = data.sketches || (data.sketch ? [data.sketch] : []);
          if (newSketches.length > 0) {
            await this.createAttachment(originalAsset.id, newSketches, "sketch", t);
          }
        }
      }
      
      // Remove photos, sketches, and existing_* fields from data before updating asset (they're handled separately)
      const { photos, sketches, sketch, existing_photos, existing_sketches, ...assetData } = data;
      
      const updatedAsset = await this.assetRepository.update(
        originalAsset.id,
        { ...assetData, updatedBy: ctx.userId },
        ctx
      );

      // Get final attachments after update to compare with original
      let newPhotos = [];
      let newSketches = [];
      
      if (hasPhotoChanges || hasSketchChanges) {
        // Get final attachments after all changes
        const finalAttachments = await this.assetAttachmentRepository.getByAssetID(originalAsset.id);
        finalAttachments.forEach(att => {
          if (att.attachment_type === AttachmentType["photo"]) {
            newPhotos.push(att.url);
          } else if (att.attachment_type === AttachmentType["sketch"]) {
            newSketches.push(att.url);
          }
        });
      } else {
        // No changes, so new is same as old
        newPhotos = [...oldPhotos];
        newSketches = [...oldSketches];
      }

      // Create log entry - only store changed data
      const oldData = {};
      const newData = {};
      
      // Check which fields actually changed (compare with original asset)
      if (data.name !== undefined && data.name !== originalAsset.name) {
        oldData.name = originalAsset.name;
        newData.name = data.name;
      }
      if (data.description !== undefined && data.description !== originalAsset.description) {
        oldData.description = originalAsset.description;
        newData.description = data.description;
      }
      if (data.address !== undefined && data.address !== originalAsset.address) {
        oldData.address = originalAsset.address;
        newData.address = data.address;
      }
      if (data.area !== undefined && data.area !== originalAsset.area) {
        oldData.area = originalAsset.area;
        newData.area = data.area;
      }
      if (data.asset_type !== undefined && data.asset_type !== originalAsset.asset_type) {
        oldData.asset_type = AssetTypeIntToStr[originalAsset.asset_type];
        newData.asset_type = AssetTypeIntToStr[data.asset_type];
      }
      if (data.status !== undefined && data.status !== originalAsset.status) {
        oldData.status = AssetStatusIntToStr[originalAsset.status];
        newData.status = AssetStatusIntToStr[data.status];
      }
      if (data.longitude !== undefined && data.longitude !== originalAsset.longitude) {
        oldData.longitude = originalAsset.longitude;
        newData.longitude = data.longitude;
      }
      if (data.latitude !== undefined && data.latitude !== originalAsset.latitude) {
        oldData.latitude = originalAsset.latitude;
        newData.latitude = data.latitude;
      }
      
      // Track photos changes - always include in log if photos were part of the update
      if (hasPhotoChanges) {
        // Always log photos if they were part of the update request
        // This ensures photos-only updates are logged
        oldData.photos = oldPhotos;
        newData.photos = newPhotos;
      }
      
      // Track sketch changes - always include in log if sketches were part of the update
      if (hasSketchChanges) {
        // Always log sketches if they were part of the update request
        // This ensures sketches-only updates are logged
        oldData.sketch = oldSketches;
        newData.sketch = newSketches;
      }

      // Only create log if there are actual changes (including photos/sketches)
      if (Object.keys(oldData).length > 0) {
        const assetLog = {
          asset_id: originalAsset.id,
          action: 'UPDATE',
          old_data: oldData,
          new_data: newData,
          created_by: ctx.userID,
        };

        await this.assetLogRepository.create(assetLog, { ...ctx, transaction: t });
      }

      return updatedAsset;
    });

    return result;
  }

  async deleteAsset(id, ctx) {
    const asset = await this.assetRepository.findById(id, ctx);
    if (!asset) return null;

    await this.assertAssetNotLinkedToTenant(id);
    
    // Create log entry before deletion
    const assetLog = {
      asset_id: asset.id,
      action: 'DELETE',
      old_data: {
        name: asset.name,
        code: asset.code,
        status: AssetStatusIntToStr[asset.status],
        asset_type: AssetTypeIntToStr[asset.asset_type],
      },
      new_data: null,
      created_by: ctx.userID,
    };

    await this.assetLogRepository.create(assetLog, ctx);

    return await this.assetRepository.delete(asset.id, ctx);
  }

  async getAssetLogs(id, ctx) {
    ctx.log?.info({ asset_id: id }, "AssetUsecase.getAssetLogs");
    const assetLogs = await this.assetLogRepository.findByAssetID(id, ctx);
    return assetLogs;
  }
}

module.exports = AssetUsecase;
