import app from './app.js';
import logger from '#config/logger.js';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
});

let isShuttingDown = false;

const gracefulShutdown = signal => {
  if (isShuttingDown) {
    logger.warn('Forced shutdown requested, exiting immediately', { signal });
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, initiating graceful shutdown...`, { signal });

  // Safety timer to force exit if cleanup takes too long (10s max)
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out (10s), forcing process termination');
    process.exit(1);
  }, 10000);

  if (forceExitTimeout.unref) {
    forceExitTimeout.unref();
  }

  server.close(err => {
    if (err) {
      logger.error('Error occurred while closing HTTP server', { error: err.message });
      process.exit(1);
    }

    logger.info('HTTP server closed cleanly. Process terminating.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
