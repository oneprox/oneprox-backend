const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');

function InitAuthRouter(authUsecase) {

  const router = Router();
  router.post(
    '/login',
    [
      body('email').isEmail().withMessage('Valid email is required'),
      body('password').isString().isLength({ min: 6 }).withMessage('Password is required')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const { email, password } = req.body;
        req.log?.info({ email }, 'route_login');
        const result = await authUsecase.login({ email, password }, { requestId: req.requestId, log: req.log });
        if (!result.ok) {
          return res.status(result.status).json({ message: result.error });
        }
        return res.status(200).json(result.data);
      } catch (error) {
        req.log?.error(error, 'route_login_error');
        return res.status(500).json({ message: 'Internal server error' });
      }
    }
  );

  // Harus didaftarkan sebelum '/impersonate/:userId'
  router.post('/impersonate/stop', authMiddleware, async (req, res) => {
    try {
      const result = await authUsecase.stopImpersonation(
        {
          userId: req.auth.userId,
          impersonatedBy: req.auth.impersonatedBy,
          reason: req.body?.reason,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
        { requestId: req.requestId, log: req.log }
      );
      if (!result.ok) {
        return res.status(result.status).json({ message: result.error });
      }
      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      req.log?.error(error, 'route_impersonate_stop_error');
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.post(
    '/impersonate/:userId',
    authMiddleware,
    [param('userId').isString().notEmpty()],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const result = await authUsecase.impersonate(
          {
            actorUserId: req.auth.userId,
            actorImpersonatedBy: req.auth.impersonatedBy,
            targetUserId: req.params.userId,
            ip: req.ip,
            userAgent: req.get('user-agent'),
          },
          { requestId: req.requestId, log: req.log }
        );
        if (!result.ok) {
          return res.status(result.status).json({ message: result.error });
        }
        return res.status(200).json(result.data);
      } catch (error) {
        req.log?.error(error, 'route_impersonate_error');
        return res.status(500).json({ message: 'Internal server error' });
      }
    }
  );

  router.post(
    '/forgot-password',
    [body('email').isEmail().withMessage('Valid email is required')],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const { email } = req.body;
        req.log?.info({ email }, 'route_forgot_password');
        await authUsecase.forgotPassword({ email }, { requestId: req.requestId, log: req.log });
        // Always 200 to avoid enumeration
        return res.status(200).json({ message: 'If that email exists, a reset link was sent' });
      } catch (error) {
        req.log?.error(error, 'route_forgot_password_error');
        // Still return 200 to avoid enumeration
        return res.status(200).json({ message: 'If that email exists, a reset link was sent' });
      }
    }
  );

  router.post(
    '/reset-password',
    [
      body('uid').isString().notEmpty(),
      body('token').isString().notEmpty(),
      body('newPassword').isString().isLength({ min: 6 })
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const { uid, token, newPassword } = req.body;
        req.log?.info({ uid }, 'route_reset_password');
        const result = await authUsecase.resetPassword({ userId: uid, token, newPassword }, { requestId: req.requestId, log: req.log });
        if (!result.ok) {
          return res.status(result.status || 400).json({ message: result.error });
        }
        return res.status(200).json({ message: 'Password updated' });
      } catch (error) {
        req.log?.error(error, 'route_reset_password_error');
        return res.status(500).json({ message: 'Internal server error' });
      }
    }
  );

  return router;
}



module.exports = { InitAuthRouter };


