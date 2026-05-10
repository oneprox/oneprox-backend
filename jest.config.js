// jest.config.js
module.exports = {
  setupFiles: ['<rootDir>/jest.setup-env.js'],
  coverageDirectory: './custom-coverage-reports',
  coverageReporters: ['json', 'lcov', 'text-summary'],
  testTimeout: 60000,
  testPathIgnorePatterns: ['/node_modules/'],
};
