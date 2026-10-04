import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const transports = [
  new winston.transports.Console({
    format: isProduction
      ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
      : winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
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
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'acquisitions-api' },
  transports,
});

export default logger;
