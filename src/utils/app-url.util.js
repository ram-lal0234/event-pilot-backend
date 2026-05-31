const env = require('../config/env');
const logger = require('../utils/logger');

const LOCAL_DEV_APP_URL = 'http://localhost:3000';

const isLocalHostUrl = (url) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
};

const isExplicitlyConfigured = () => Boolean(
  process.env.PUBLIC_APP_URL?.trim() || process.env.PUBLIC_RSVP_BASE_URL?.trim()
);

const resolvePublicAppBase = () => {
  const base = String(env.publicAppUrl || LOCAL_DEV_APP_URL).replace(/\/$/, '');

  if (env.nodeEnv === 'production') {
    if (!isExplicitlyConfigured() || isLocalHostUrl(base)) {
      logger.error(
        'PUBLIC_APP_URL or PUBLIC_RSVP_BASE_URL must be set to your public app URL in production (WhatsApp/outreach links are broken otherwise)'
      );
    }
  }

  return base;
};

const buildPublicAppPath = (pathPrefix, code) => {
  const base = resolvePublicAppBase();
  return `${base}${pathPrefix}${code}`;
};

module.exports = {
  isLocalHostUrl,
  resolvePublicAppBase,
  buildPublicAppPath
};
