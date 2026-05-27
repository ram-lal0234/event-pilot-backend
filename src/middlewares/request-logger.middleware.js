const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

const getRequestId = (req) => {
  return req.headers['x-request-id']
    || req.headers['x-amzn-trace-id']
    || req.headers['x-amz-cf-id']
    || randomUUID();
};

const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId = getRequestId(req);

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id
    });
  });

  next();
};

module.exports = requestLogger;
