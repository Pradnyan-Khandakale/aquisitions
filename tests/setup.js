import { jest } from '@jest/globals';

// Expose jest globally in native ESM environment
globalThis.jest = jest;

// Test environment configuration
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-key-for-automated-tests';

// Ensure ARCJET_KEY is populated to avoid early exits
if (!process.env.ARCJET_KEY) {
  process.env.ARCJET_KEY = 'ajkey_test_dummy_key';
}
