import app from './app.js';
import logger from '#config/logger.js';

const PORT = process.env.PORT || 3000;
const releaseSha =
  process.env.RELEASE_SHA ||
  process.env.COMMIT_SHA ||
  process.env.GIT_SHA ||
  'development';

const server = app.listen(PORT, () => {
  logger.info(`Acquisitions API listening on port ${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    releaseSha,
  });
});

let isShuttingDown = false;

const gracefulShutdown = signal => {
  if (isShuttingDown) {
    logger.warn('Forced shutdown requested, exiting immediately', { signal });
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, initiating graceful shutdown...`, {
    signal,
  });

  // Safety timer to force exit if cleanup takes too long (10s max)
  const forceExitTimeout = setTimeout(() => {
    logger.error(
      'Graceful shutdown timed out (10s), forcing process termination',
      { signal }
    );
    process.exit(1);
  }, 10000);

  if (forceExitTimeout.unref) {
    forceExitTimeout.unref();
  }

  server.close(err => {
    if (err) {
      logger.error('Error occurred while closing HTTP server', {
        error: err.message,
      });
      process.exit(1);
    }

    logger.info('HTTP server closed cleanly. Process terminating.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', err => {
  logger.error('Fatal uncaught exception occurred, exiting process', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled promise rejection occurred, exiting process', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

export default server;
