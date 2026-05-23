const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'otp',
  'otphash',
  'token',
  'accesstoken',
  'jwt',
  'secret',
  'plivoauthtoken',
  'resendapikey',
  'databaseurl',
  'directurl'
]);

const shouldRedact = (key) => {
  const normalized = String(key).replace(/[_-]/g, '').toLowerCase();
  return SENSITIVE_KEYS.has(normalized) || normalized.includes('secret') || normalized.includes('token');
};

const sanitize = (value) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code
    };
  }

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    acc[key] = shouldRedact(key) ? '[REDACTED]' : sanitize(nestedValue);
    return acc;
  }, {});
};

const format = (level, message, meta = {}) => {
  const payload = {
    level,
    message: message instanceof Error ? message.message : message,
    timestamp: new Date().toISOString(),
    ...sanitize(meta)
  };

  return JSON.stringify(payload);
};

module.exports = {
  info(message, meta) {
    console.log(format('info', message, meta));
  },
  warn(message, meta) {
    console.warn(format('warn', message, meta));
  },
  error(message, meta) {
    console.error(format('error', message, {
      error: message instanceof Error ? message : undefined,
      ...meta
    }));
  }
};
