const format = (level, message, meta = {}) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta
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
    console.error(format('error', message instanceof Error ? message.message : message, {
      stack: message instanceof Error ? message.stack : undefined,
      ...meta
    }));
  }
};
