const jwt = require('jsonwebtoken');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { userId: payload.sub, roleId: payload.roleId, roleName: payload.roleName };
    if (payload.impersonatedBy) {
      req.auth.impersonatedBy = payload.impersonatedBy;
      if (req.method && req.method !== 'GET') {
        req.log?.info(
          { impersonatorId: payload.impersonatedBy, userId: payload.sub, method: req.method, url: req.originalUrl },
          'impersonated_request'
        );
      }
    }
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function ensureRole(req, res, next) {
  // Check if this is a userTask route
  const isUserTaskRoute = req.baseUrl?.includes('/user-tasks') || req.path?.includes('/user-tasks') || req.originalUrl?.includes('/api/user-tasks');
  
  // if (isUserTaskRoute) {
  //   // For userTask routes, only allow role_id > 2
  //   const roleId = req.auth?.roleId;
  //   const roleIdNum = typeof roleId === 'string' ? parseInt(roleId, 10) : roleId;
  //   if (!roleId || roleIdNum <= 2 || isNaN(roleIdNum)) {
  //     return res.status(403).json({ message: 'Forbidden: Insufficient role access' });
  //   }
  //   return next();
  // }
  
  // For most routes, only super_admin and admin can access
  const roleName = req.auth?.roleName;
  // if (roleName !== 'super_admin' && roleName !== 'admin') {
  //   return res.status(403).json({ message: 'Forbidden: Admin or Super Admin access required' });
  // }
  
  return next();
}

module.exports = { authMiddleware, ensureRole };
