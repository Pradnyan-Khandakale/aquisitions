import winston from 'winston';
import { getRequestId } from '#utils/request-context.js';
import { redact } from '#utils/redact.js';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Formatter to inject request correlation ID from AsyncLocalStorage when available
const requestContextFormat = winston.format(info => {
  const reqId = getRequestId();
  if (reqId && !info.requestId) {
    info.requestId = reqId;
  }
  return info;
});

// Formatter to sanitize sensitive tokens, passwords, database URLs, and secrets
const safeRedactFormat = winston.format(info => {
  return redact(info);
});

let consoleFormat;
if (isProduction) {
  consoleFormat = winston.format.combine(
    requestContextFormat(),
    safeRedactFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );
} else {
  consoleFormat = winston.format.combine(
    requestContextFormat(),
    safeRedactFormat(),
    winston.format.colorize(),
    winston.format.simple()
  );
}

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// In non-production and non-test, optionally write to local log files for offline inspection
if (!isProduction && !isTest) {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isTest ? 'error' : 'info'),
  silent: isTest && !process.env.ENABLE_TEST_LOGS,
  format: winston.format.combine(
    requestContextFormat(),
    safeRedactFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'acquisitions-api',
    environment: process.env.NODE_ENV || 'development',
    version:
      process.env.RELEASE_SHA ||
      process.env.COMMIT_SHA ||
      process.env.npm_package_version ||
      '1.0.0',
  },
  transports,
});

export default logger;
