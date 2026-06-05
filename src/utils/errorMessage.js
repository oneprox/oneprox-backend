/**
 * Ambil pesan error yang bisa ditampilkan ke client (Sequelize, Error, string).
 */
function errorMessage(err, fallback = 'Operasi gagal') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  return (
    err.message ||
    err.original?.message ||
    err.parent?.detail ||
    err.parent?.message ||
    fallback
  );
}

module.exports = { errorMessage };
