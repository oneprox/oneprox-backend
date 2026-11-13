const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/Mailer');

// Lama sesi "login sebagai" (menit)
const IMPERSONATION_TTL_MINUTES = 60;

class AuthUsecase {
  constructor(userRepository, jwtSecret, tokenTtl = '365d', appBaseUrl, tokenRepository, roleRepository, userAssetRepository, settingsRepository = null, userLogRepository = null) {
    this.userRepository = userRepository;
    this.jwtSecret = jwtSecret;
    this.tokenTtl = tokenTtl;
    this.appBaseUrl = appBaseUrl;
    this.tokenRepository = tokenRepository;
    this.roleRepository = roleRepository;
    this.userAssetRepository = userAssetRepository;
    this.settingsRepository = settingsRepository;
    this.userLogRepository = userLogRepository;
  }

  /** Baca setting impersonate dari tabel settings. Default: nonaktif. Sesi selalu 60 menit. */
  async getImpersonationConfig(ctx) {
    const enabledRow = await this.settingsRepository?.findByKey('impersonation_enabled', ctx);
    const enabled = String(enabledRow?.value || '').trim().toLowerCase() === 'true';
    return { enabled, ttlMinutes: IMPERSONATION_TTL_MINUTES };
  }

  async writeUserLog(data, ctx) {
    if (!this.userLogRepository) return false;
    try {
      await this.userLogRepository.create(data, ctx);
      return true;
    } catch (error) {
      ctx.log?.error({ error: error.message, action: data.action }, 'impersonation_user_log_failed');
      return false;
    }
  }

  async login({ email, password }, ctx) {
    ctx.log?.info({ email }, 'login_attempt');
    const user = await this.userRepository.findByEmail(email, ctx);
    if (!user) {
      ctx.log?.warn({ email }, 'login_invalid_email');
      return { ok: false, status: 401, error: 'Invalid credentials' };
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      ctx.log?.warn({ userId: user.id }, 'login_invalid_password');
      return { ok: false, status: 401, error: 'Invalid credentials' };
    }

    if (!this.jwtSecret) {
      return { ok: false, status: 500, error: 'Server misconfiguration: missing JWT_SECRET' };
    }

    const role = await this.roleRepository.findById(user.role_id, ctx);
    const userAssets = await this.userAssetRepository.getByUserID(user.id, ctx)

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roleId: user.role_id,
        roleName: role.name,
        assetIds: userAssets.map(ua => ua.asset_id)
      },
      this.jwtSecret,
      { expiresIn: this.tokenTtl }
    );

    const result = {
      ok: true,
      status: 200,
      data: {
        token,
        user
      }
    };
    ctx.log?.info({ userId: user.id }, 'login_success');
    return result;
  }

  /**
   * Superadmin "login sebagai" user lain (untuk keperluan testing).
   * Aktif hanya jika setting `impersonation_enabled` = true.
   * Token hasil impersonate membawa klaim `impersonatedBy` dan berlaku 60 menit.
   * Setiap sesi dicatat di user_logs.
   */
  async impersonate({ actorUserId, actorImpersonatedBy, targetUserId, ip, userAgent }, ctx) {
    const { enabled, ttlMinutes } = await this.getImpersonationConfig(ctx);
    if (!enabled) {
      return { ok: false, status: 403, error: 'Fitur login sebagai user sedang nonaktif (setting impersonation_enabled)' };
    }
    if (!this.jwtSecret) {
      return { ok: false, status: 500, error: 'Server misconfiguration: missing JWT_SECRET' };
    }
    if (actorImpersonatedBy) {
      return { ok: false, status: 403, error: 'Kembali ke akun superadmin terlebih dahulu' };
    }

    // Cek role actor dari DB, bukan hanya dari klaim token
    const actor = await this.userRepository.findById(actorUserId, ctx);
    const actorRole = actor ? await this.roleRepository.findById(actor.role_id, ctx) : null;
    if (!actor || actorRole?.name !== 'super_admin') {
      ctx.log?.warn({ actorUserId, targetUserId }, 'impersonation_denied_not_superadmin');
      return { ok: false, status: 403, error: 'Hanya super_admin yang boleh login sebagai user lain' };
    }

    if (targetUserId === actor.id) {
      return { ok: false, status: 400, error: 'Tidak bisa login sebagai diri sendiri' };
    }

    const target = await this.userRepository.findById(targetUserId, ctx);
    if (!target) {
      return { ok: false, status: 404, error: 'User tidak ditemukan' };
    }
    const targetRole = await this.roleRepository.findById(target.role_id, ctx);
    if (targetRole?.name === 'super_admin') {
      return { ok: false, status: 403, error: 'Tidak bisa login sebagai super_admin lain' };
    }

    const userAssets = await this.userAssetRepository.getByUserID(target.id, ctx);
    const token = jwt.sign(
      {
        sub: target.id,
        email: target.email,
        roleId: target.role_id,
        roleName: targetRole?.name,
        assetIds: userAssets.map(ua => ua.asset_id),
        impersonatedBy: actor.id,
      },
      this.jwtSecret,
      { expiresIn: ttlMinutes * 60 }
    );

    // Audit log wajib: jika gagal dicatat, sesi tidak diberikan
    const logged = await this.writeUserLog({
      user_id: target.id,
      action: 'impersonate_start',
      old_data: null,
      new_data: {
        impersonator_id: actor.id,
        impersonator_name: actor.name,
        impersonator_email: actor.email,
        target_email: target.email,
        target_role: targetRole?.name,
        ttl_minutes: ttlMinutes,
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        ip: ip || null,
        user_agent: userAgent || null,
      },
      created_by: actor.id,
    }, ctx);
    if (!logged) {
      return { ok: false, status: 500, error: 'Gagal mencatat log impersonate' };
    }

    const { password: _pw, ...safeUser } = target;
    ctx.log?.warn(
      { impersonatorId: actor.id, impersonatorEmail: actor.email, targetUserId: target.id, targetEmail: target.email, ttlMinutes },
      'impersonation_started'
    );
    return {
      ok: true,
      status: 200,
      data: {
        token,
        user: safeUser,
        impersonator: { id: actor.id, name: actor.name, email: actor.email },
        ttl_minutes: ttlMinutes,
      },
    };
  }

  /** Catat akhir sesi impersonate (dipanggil dengan token hasil impersonate). */
  async stopImpersonation({ userId, impersonatedBy, reason, ip, userAgent }, ctx) {
    if (!impersonatedBy) {
      return { ok: false, status: 400, error: 'Sesi ini bukan sesi impersonate' };
    }
    await this.writeUserLog({
      user_id: userId,
      action: 'impersonate_end',
      old_data: null,
      new_data: {
        impersonator_id: impersonatedBy,
        reason: reason === 'expired' ? 'expired' : 'manual',
        ip: ip || null,
        user_agent: userAgent || null,
      },
      created_by: impersonatedBy,
    }, ctx);
    ctx.log?.warn({ impersonatorId: impersonatedBy, userId, reason }, 'impersonation_ended');
    return { ok: true, status: 200 };
  }

  async forgotPassword({email}, ctx) {
    ctx.log?.info({ email }, 'usecase_request_password_reset_start');
    const user = await this.userRepository.findByEmail(email, ctx);
    if (!user) {
      // Silently succeed to avoid user enumeration
      ctx.log?.warn({ email }, 'usecase_request_password_reset_user_not_found');
      return { ok: true };
    }

    // Invalidate old tokens
    await this.tokenRepository.deleteAllForUser(user.id, ctx);

    // Create token
    const tokenPlain = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await this.tokenRepository.createToken({ userId: user.id, tokenHash, expiresAt }, ctx);
    ctx.log?.info({ userId: user.id }, 'usecase_request_password_reset_token_created');

    const resetUrl = `${this.appBaseUrl.replace(/\/$/, '')}/auth/reset-password?token=${encodeURIComponent(tokenPlain)}&uid=${encodeURIComponent(user.id)}`;
    const userName = user.name || user.email.split('@')[0];
    await sendPasswordResetEmail({ to: user.email, resetUrl, userName });
    ctx.log?.info({ userId: user.id }, 'usecase_request_password_reset_email_sent');
    return { ok: true };
  }

  async resetPassword({userId, token, newPassword}, ctx) {
    ctx.log?.info({ userId }, 'usecase_reset_password_start');
    // Token is stored as a sha256 digest for deterministic lookup
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenRecord = await this.tokenRepository.findValidByTokenHash(tokenHash, ctx);
    if (!tokenRecord || tokenRecord.user_id !== userId) {
      ctx.log?.warn({ userId }, 'usecase_reset_password_invalid_token');
      return { ok: false, status: 400, error: 'Invalid or expired token' };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.updatePassword(userId, passwordHash, ctx);
    await this.tokenRepository.markUsed(tokenRecord.id, ctx);
    ctx.log?.info({ userId }, 'usecase_reset_password_success');
    return { ok: true };
  }
}

module.exports = AuthUsecase;
