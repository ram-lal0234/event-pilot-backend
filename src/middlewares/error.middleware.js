const logger = require('../utils/logger');

const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

const isDatabaseConnectionError = (err) => {
  const message = err?.message || '';

  return err?.code === 'P1001'
    || message.includes("Can't reach database server")
    || message.includes('Prisma Client could not locate the Query Engine');
};

const errorHandler = (err, req, res, next) => {
  const databaseConnectionError = isDatabaseConnectionError(err);
  const statusCode = databaseConnectionError ? 503 : (err.statusCode || 500);
  const code = databaseConnectionError ? 'SERVICE_UNAVAILABLE' : (err.code || 'INTERNAL_ERROR');
  const isServerError = statusCode >= 500;
  const message = databaseConnectionError
    ? 'Service is temporarily unavailable. Please try again later.'
    : 'Something went wrong while processing your request. Please try again later.';

  if (isServerError) {
    logger.error(err, {
      path: req.originalUrl,
      method: req.method
    });
  }

  res.status(statusCode).json({
    success: false,
    message: isServerError ? message : err.message,
    code,
    ...(isServerError ? {} : { details: err.details })
  });
};

module.exports = {
  notFound,
  errorHandler
};
