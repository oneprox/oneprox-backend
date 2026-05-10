// Dijalankan sebelum tes memuat aplikasi Express (jelaskan app.listen di src/app.js)
process.env.VERCEL = '1';
process.env.VERCEL_ENV = 'jest';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'jest-jwt-secret-must-be-set-for-auth-middleware';
}
