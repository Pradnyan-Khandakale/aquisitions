import logger from '#config/logger.js';

/**
 * Centralized error-handling middleware.
 * - Logs errors once at appropriate severity (error for 5xx, warn for 4xx)
 * - Captures request ID, method, path, status, and server-side stack trace
 * - In production, shields clients from internal error messages/stacks
 * - Returns consistent JSON responses with request ID correlation
 */
export const errorHandler = (err, req, res, _next) => {
  const statusCode = err.status || err.statusCode || 500;
  const requestId = req.id || res.locals?.requestId;

  const logPayload = {
    requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode,
    errorName: err.name,
    errorMessage: err.message,
    stack: err.stack,
  };

  if (statusCode >= 500) {
    logger.error('Unhandled request error', logPayload);
  } else {
    logger.warn('Client request error', logPayload);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const errorTitle =
    statusCode >= 500 && isProduction
      ? 'Internal Server Error'
      : err.name || 'Internal Server Error';
  const clientMessage =
    statusCode >= 500 && isProduction
      ? 'Internal Server Error'
      : err.message || 'Something went wrong';

  res.status(statusCode).json({
    error: errorTitle,
    message: clientMessage,
    ...(requestId ? { requestId } : {}),
  });
};

export default errorHandler;
