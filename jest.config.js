export default {
  testEnvironment: 'node',
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/server.js',
    '!src/config/arcjet.js',
  ],
  coverageReporters: ['text', 'lcov', 'json', 'clover'],
};
