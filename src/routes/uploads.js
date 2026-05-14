const { Router } = require("express");
const { authMiddleware, ensureRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { compressUploadedImages } = require('../middleware/imageCompressor');
const { getUploadUrl } = require('../services/baseUrl');

function InitUploadRouter() {
  const router = Router();

  // Simple multer configuration
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadType = req.params.type || 'general';
      const uploadPath = path.join(__dirname, '../../public/uploads', uploadType);
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const name = Date.now() + ext;
      cb(null, name);
    }
  });

  const maxUploadBytes = Number(process.env.UPLOAD_MAX_FILE_BYTES) || 25 * 1024 * 1024;
  const upload = multer({
    storage: storage,
    limits: { fileSize: maxUploadBytes },
  });

  function singleFile(fieldName) {
    return (req, res, next) => {
      upload.single(fieldName)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            const mb = Math.max(1, Math.round(maxUploadBytes / (1024 * 1024)));
            return res.status(413).json({ error: `File exceeds the ${mb}MB upload limit` });
          }
          return res.status(400).json({ error: err.message });
        }
        if (err) return next(err);
        next();
      });
    };
  }

  // Test route without auth for debugging
  router.get('/test', (req, res) => {
    res.json({ 
      message: 'Upload router is working', 
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    });
  });

  // Simple upload route without auth for testing
  router.post('/simple-upload', singleFile('file'), compressUploadedImages, (req, res) => {
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const host = req.protocol + '://' + req.get('host');
    const fileUrl = `${host}/uploads/${req.file.filename}`;
    
    res.json({
      message: 'Upload successful',
      url: fileUrl,
      filename: req.file.filename
    });
  });

  // Tenant upload route with auth
  router.post('/:type', authMiddleware, ensureRole, singleFile('file'), compressUploadedImages, (req, res) => {
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileUrl = getUploadUrl(`${req.params.type}/${req.file.filename}`, req);
    
    res.json({
      url: [fileUrl]
    });
  });

  return router;
}

module.exports = { InitUploadRouter };