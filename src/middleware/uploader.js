const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { compressUploadedImages } = require("./imageCompressor");
const {
  UPLOAD_MAX_FILE_BYTES,
  UPLOAD_MAX_FILE_MB,
} = require("../config/uploadLimits");

function uploadMiddleware(req, res, next) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      // Use the type parameter from the route for tenant uploads
      const uploadType = req.params.type || req.path.split('/').pop() || 'general';
      const uploadPath = path.join("public/uploads", uploadType);
      console.log('Upload path:', uploadPath, 'Type:', uploadType, 'Path:', req.path)
      fs.mkdirSync(uploadPath, { recursive: true });

      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      const tempOriginal = file.originalname.split('.')
      cb(null, Date.now() + '.' +tempOriginal[tempOriginal.length-1]);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: UPLOAD_MAX_FILE_BYTES },
  });

  const uploadHandler = upload.fields([
    { name: 'photos', maxCount: 10 },
    { name: 'sketch', maxCount: 1 },
    { name: 'sketches', maxCount: 10 },
    { name: 'file', maxCount: 10 }
  ]);

  uploadHandler(req, res, async function (err) {
    
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .json({ error: `One or more files exceed the ${UPLOAD_MAX_FILE_MB}MB size limit` });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    // File upload is optional for asset creation
    // if (!req.files || req.files.length === 0) {
    //   return res.status(400).json({ error: "No files uploaded" });
    // }

    // Compress uploaded images
    try {
      await compressUploadedImages(req, res, () => {});
    } catch (compressionError) {
      console.error('Error compressing images:', compressionError);
      // Continue even if compression fails
    }

    next();
  });
}

module.exports = uploadMiddleware;
