const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/Mailer');

class AuthUsecase {
  constructor(userRepository, jwtSecret, tokenTtl = '365d', appBaseUrl, tokenRepository, roleRepository, userAssetRepository) {
    this.userRepository = userRepository;
    this.jwtSecret = jwtSecret;
    this.tokenTtl = tokenTtl;
    this.appBaseUrl = appBaseUrl;
    this.tokenRepository = tokenRepository;
    this.roleRepository = roleRepository;
    this.userAssetRepository = userAssetRepository;
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
