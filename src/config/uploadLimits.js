/** Batas ukuran upload file seragam (bytes). Override: UPLOAD_MAX_FILE_BYTES atau UPLOAD_MAX_FILE_MB */
const UPLOAD_MAX_FILE_MB = Number(process.env.UPLOAD_MAX_FILE_MB) || 30;
const UPLOAD_MAX_FILE_BYTES =
  Number(process.env.UPLOAD_MAX_FILE_BYTES) ||
  Math.max(1, UPLOAD_MAX_FILE_MB) * 1024 * 1024;

module.exports = {
  UPLOAD_MAX_FILE_MB,
  UPLOAD_MAX_FILE_BYTES,
};
