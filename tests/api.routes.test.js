'use strict';

/**
 * Smoke/integration: semua mount API utama merespons (tanpa crash).
 * Bearer tidak ada / tidak valid → 401 untuk route yang pakai JWT.
 * Basic Auth internal → 401 atau 500 (env belum dikonfigurasi).
 */

const request = require('supertest');

const app = require('../src/app');

afterAll(async () => {
  try {
    const sequelize = require('../src/models/sequelize');
    if (sequelize && typeof sequelize.close === 'function') {
      await sequelize.close();
    }
  } catch (_e) {
    /* abaikan */
  }
});

function bearerInvalid() {
  return { Authorization: 'Bearer obviously.invalid.jwt.token' };
}

/** UUID sintetis untuk pola path (tenant, user, complaint, asset, unit) */
const U = '00000000-0000-4000-8000-000000000001';

describe('Tanpa auth — endpoint publik', () => {
  it('GET /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  it('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health/db — koneksi DB boleh sukses atau gagal', async () => {
    const res = await request(app).get('/health/db');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /metrics — aktif hanya jika METRICS_ENABLED=true', async () => {
    const res = await request(app).get('/metrics');
    expect([200, 404]).toContain(res.status);
  });

  it('GET /api/uploads/test', async () => {
    const res = await request(app).get('/api/uploads/test');
    expect(res.status).toBe(200);
  });

  it('POST /api/uploads/simple-upload tanpa file → 400 (bukan JWT)', async () => {
    const res = await request(app).post('/api/uploads/simple-upload');
    expect(res.status).toBe(400);
  });
});

describe('Tanpa auth — /api/auth', () => {
  it('POST /api/auth/login body kosong → 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login format email salah → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bukan-email', password: '123456' });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/forgot-password email valid → 200', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'tidak-ada@test.local' });
    expect(res.status).toBe(200);
  });

  it('POST /api/auth/reset-password body tidak lengkap → 400', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({});
    expect(res.status).toBe(400);
  });
});

describe('JWT tidak valid → 401', () => {
  it('GET /api/assets dengan token sampah', async () => {
    const res = await request(app).get('/api/assets').set(bearerInvalid());
    expect(res.status).toBe(401);
  });
});

describe('Tanpa Bearer — route terlindungi JWT → 401', () => {
  const protectedGets = [
    ['/api/assets', 'GET'],
    [`/api/assets/${U}`, 'GET'],
    [`/api/assets/${U}/logs`, 'GET'],
    ['/api/users', 'GET'],
    ['/api/users/permissions', 'GET'],
    ['/api/users/menus', 'GET'],
    ['/api/users/sidebar', 'GET'],
    ['/api/users/check-menu-access', 'GET'],
    [`/api/users/${U}`, 'GET'],
    [`/api/users/${U}/logs`, 'GET'],
    [`/api/users/${U}/assets`, 'GET'],
    ['/api/units', 'GET'],
    [`/api/units/${U}`, 'GET'],
    [`/api/units/${U}/logs`, 'GET'],
    ['/api/tenants', 'GET'],
    [`/api/tenants/${U}`, 'GET'],
    [`/api/tenants/${U}/logs`, 'GET'],
    [`/api/tenants/${U}/deposito-logs`, 'GET'],
    [`/api/tenants/${U}/payments`, 'GET'],
    [`/api/tenants/${U}/legals`, 'GET'],
    ['/api/tasks', 'GET'],
    ['/api/tasks/1', 'GET'],
    ['/api/tasks/1/logs', 'GET'],
    ['/api/tasks/999999/logs', 'GET'],
    ['/api/task-groups', 'GET'],
    ['/api/task-groups/work/list', 'GET'],
    ['/api/task-groups/1', 'GET'],
    ['/api/roles', 'GET'],
    ['/api/roles/1', 'GET'],
    ['/api/roles/1/menu-permissions', 'GET'],
    ['/api/menus', 'GET'],
    ['/api/menus/1', 'GET'],
    ['/api/scan-infos', 'GET'],
    ['/api/scan-infos/1', 'GET'],
    ['/api/scan-infos/1/qr-code', 'GET'],
    ['/api/scan-infos/scan-code/test-code', 'GET'],
    ['/api/user-tasks', 'GET'],
    ['/api/user-tasks/upcoming', 'GET'],
    ['/api/user-tasks/non-routine', 'GET'],
    ['/api/user-tasks/daily-status', 'GET'],
    ['/api/user-tasks/code/GENERIC-CODE', 'GET'],
    ['/api/user-tasks/1', 'GET'],
    ['/api/complaint-reports', 'GET'],
    [`/api/complaint-reports/${U}`, 'GET'],
    [`/api/complaint-reports/${U}/logs`, 'GET'],
    ['/api/dashboard', 'GET'],
    ['/api/dashboard/stats', 'GET'],
    ['/api/dashboard/top-asset-revenue', 'GET'],
    ['/api/dashboard/revenue-growth', 'GET'],
    ['/api/dashboard/asset-overview', 'GET'],
    ['/api/dashboard/financial-table', 'GET'],
    ['/api/dashboard/worker-user-tasks', 'GET'],
    ['/api/dashboard/non-routine-work', 'GET'],
    ['/api/settings', 'GET'],
    ['/api/settings?key=test_setting_key', 'GET'],
    ['/api/settings/1', 'GET'],
    ['/api/attendances/history', 'GET'],
    [`/api/attendances/today-status/${U}`, 'GET'],
    [`/api/attendances/asset-history/${U}`, 'GET'],
  ];

  it.each(protectedGets)('%s %s → 401', async (path, method) => {
    const agent = request(app)[method.toLowerCase()](path);
    const res = await agent;
    expect(res.status).toBe(401);
  });

  const protectedPosts = [
    ['/api/tenants', 'POST'],
    ['/api/tasks', 'POST'],
    ['/api/task-groups', 'POST'],
    ['/api/units', 'POST'],
    ['/api/users', 'POST'],
    ['/api/complaint-reports', 'POST'],
    ['/api/scan-infos', 'POST'],
    ['/api/assets', 'POST'],
    ['/api/attendances/check-in', 'POST'],
    ['/api/attendances/check-out', 'POST'],
    ['/api/user-tasks/generate-upcoming', 'POST'],
    ['/api/menus', 'POST'],
    ['/api/roles', 'POST'],
    ['/api/settings', 'POST'],
    [`/api/tenants/${U}/payments`, 'POST'],
    [`/api/tenants/${U}/deposito-logs`, 'POST'],
    [`/api/tenants/${U}/legals`, 'POST'],
    ['/api/uploads/general', 'POST'],
  ];

  it.each(protectedPosts)('%s %s → 401', async (path, method) => {
    const agent = request(app)[method.toLowerCase()](path).send({});
    const res = await agent;
    expect(res.status).toBe(401);
  });

  const protectedPuts = [
    [`/api/assets/${U}`, 'PUT'],
    [`/api/users/${U}`, 'PUT'],
    [`/api/units/${U}`, 'PUT'],
    [`/api/tenants/${U}`, 'PUT'],
    ['/api/tasks/1', 'PUT'],
    ['/api/task-groups/1', 'PUT'],
    ['/api/roles/1', 'PUT'],
    ['/api/roles/1/menu-permissions', 'PUT'],
    ['/api/menus/1', 'PUT'],
    ['/api/scan-infos/1', 'PUT'],
    [`/api/complaint-reports/${U}`, 'PUT'],
    ['/api/settings/1', 'PUT'],
    ['/api/settings/update-by-key', 'PUT'],
    ['/api/user-tasks/1/start', 'PUT'],
    ['/api/user-tasks/1/complete', 'PUT'],
    [`/api/tenants/${U}/payments/1`, 'PUT'],
    [`/api/tenants/${U}/deposito-logs/1`, 'PUT'],
    [`/api/tenants/${U}/legals/1`, 'PUT'],
  ];

  it.each(protectedPuts)('%s %s → 401', async (path, method) => {
    const agent = request(app)[method.toLowerCase()](path).send({});
    const res = await agent;
    expect(res.status).toBe(401);
  });

  const protectedDeletes = [
    [`/api/assets/${U}`, 'DELETE'],
    [`/api/users/${U}`, 'DELETE'],
    [`/api/units/${U}`, 'DELETE'],
    [`/api/tenants/${U}`, 'DELETE'],
    ['/api/tasks/1', 'DELETE'],
    ['/api/task-groups/1', 'DELETE'],
    ['/api/roles/1', 'DELETE'],
    ['/api/menus/1', 'DELETE'],
    ['/api/scan-infos/1', 'DELETE'],
    [`/api/complaint-reports/${U}`, 'DELETE'],
    ['/api/settings/1', 'DELETE'],
    [`/api/tenants/${U}/payments/1`, 'DELETE'],
    [`/api/tenants/${U}/deposito-logs/1`, 'DELETE'],
    [`/api/tenants/${U}/legals/1`, 'DELETE'],
  ];

  it.each(protectedDeletes)('%s %s → 401', async (path, method) => {
    const agent = request(app)[method.toLowerCase()](path);
    const res = await agent;
    expect(res.status).toBe(401);
  });
});

describe('/api/internal — Basic Auth', () => {
  it('GET /api/internal/tenant-payments/due-soon tanpa Authorization → 401 atau 500 (env)', async () => {
    const res = await request(app).get('/api/internal/tenant-payments/due-soon');
    expect([401, 500]).toContain(res.status);
  });

  it('DELETE /api/internal/user-task-evidence/old tanpa Authorization', async () => {
    const res = await request(app).delete(
      '/api/internal/user-task-evidence/old?months=6'
    );
    expect([401, 500]).toContain(res.status);
  });

  it('POST /api/internal/user-tasks/generate-non-routine-monthly tanpa Authorization', async () => {
    const res = await request(app).post(
      '/api/internal/user-tasks/generate-non-routine-monthly'
    );
    expect([401, 500]).toContain(res.status);
  });

  // Jangan memanggil internal dengan Basic Auth di sini: endpoint seperti
  // tenant-payments/due-soon bisa mengubah data tenant / mengirim email.
});

describe('Opsional — JWT sah (set TEST_API_EMAIL + TEST_API_PASSWORD di .env)', () => {
  const email = process.env.TEST_API_EMAIL;
  const password = process.env.TEST_API_PASSWORD;

  let token;

  beforeAll(async () => {
    if (!email || !password) return;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    if (res.status === 200 && res.body && res.body.token) {
      token = res.body.token;
    }
  });

  const cond = !email || !password || !token ? it.skip : it;

  cond('GET /api/assets dengan token login → bukan 401', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });

  cond('GET /api/dashboard dengan token login → bukan 401', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});
