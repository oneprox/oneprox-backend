const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { compressUploadedImages } = require("./imageCompressor");
const {
  UPLOAD_MAX_FILE_BYTES,
  UPLOAD_MAX_FILE_MB,
} = require("../config/uploadLimits");

function uploadUserTaskEvidenceMiddleware() {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadPath = path.join("public/uploads", "user-task-evidence");
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      const tempOriginal = file.originalname.split('.');
      const ext = tempOriginal[tempOriginal.length - 1];
      cb(null, Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + ext);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: UPLOAD_MAX_FILE_BYTES },
  });

  const uploadHandler = upload.fields([
    { name: 'file_before', maxCount: 1 },
    { name: 'file_after', maxCount: 1 },
    { name: 'file_scan', maxCount: 1 },
  ]);

  return (req, res, next) => {
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: `Ukuran file melebihi batas ${UPLOAD_MAX_FILE_MB}MB. Gunakan foto dengan resolusi lebih kecil.`,
            error: `File exceeds ${UPLOAD_MAX_FILE_MB}MB limit`,
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message,
          error: err.message,
        });
      }
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Upload gagal',
          error: err.message || 'Upload failed',
        });
      }
      next();
    });
  };
}

/** Hanya parse multipart jika benar-benar upload file (hindari ganggu body JSON) */
function optionalUploadUserTaskEvidence(req, res, next) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return uploadUserTaskEvidenceMiddleware()(req, res, next);
  }
  return next();
}

module.exports = uploadUserTaskEvidenceMiddleware;
module.exports.optionalUploadUserTaskEvidence = optionalUploadUserTaskEvidence;

