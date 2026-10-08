import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  if (status >= 500) {
    logger.error({ err }, 'Unhandled error');
  } else {
    logger.warn({ status, message: err.message }, 'Client error');
  }

  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({ error: message });
}
