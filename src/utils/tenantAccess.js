// Otorisasi data tenant.
//
// Role "tenant" hanya boleh menyentuh tenant miliknya sendiri (tenants.user_id ===
// user yang login). Role lain (admin, super_admin, dsb) tidak dibatasi di sini.
//
// Ketika akses ditolak, pemanggil sebaiknya melempar error "not found" yang sama
// dengan kasus data tidak ada, supaya keberadaan data tenant lain tidak terungkap.

function isTenantScopedRole(ctx) {
  return String(ctx?.roleName || '').toLowerCase() === 'tenant';
}

function canAccessTenant(tenant, ctx) {
  if (!tenant) return false;
  if (!isTenantScopedRole(ctx)) return true;
  return tenant.user_id === ctx?.userId;
}

function notFoundError(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

/**
 * Ambil tenant dan pastikan ctx boleh mengaksesnya.
 * Melempar error (statusCode 404) bila tenant tidak ada atau bukan milik ctx.
 */
async function ensureTenantAccessible(
  tenantRepository,
  tenantId,
  ctx,
  notFoundMessage = 'Tenant not found'
) {
  const tenant = await tenantRepository.findById(tenantId, ctx);
  if (!canAccessTenant(tenant, ctx)) {
    if (tenant) {
      ctx?.log?.warn(
        { tenant_id: tenantId, user_id: ctx?.userId },
        'tenant_access_denied'
      );
    }
    throw notFoundError(notFoundMessage);
  }
  return tenant;
}

/**
 * Role tenant bersifat hanya-baca terhadap data tenant: tidak boleh membuat,
 * mengubah, atau menghapus tenant maupun turunannya (payment log, legal,
 * deposito log). Selaras dengan role_menu_permissions role tenant yang hanya
 * memiliki can_view.
 */
function assertCanWriteTenantData(ctx) {
  if (isTenantScopedRole(ctx)) {
    ctx?.log?.warn(
      { user_id: ctx?.userId },
      'tenant_write_denied'
    );
    const err = new Error('Forbidden: role tenant hanya dapat melihat data');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  isTenantScopedRole,
  canAccessTenant,
  ensureTenantAccessible,
  assertCanWriteTenantData,
  notFoundError,
};
