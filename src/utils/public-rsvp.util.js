const env = require('../config/env');

const buildPublicRsvpUrl = (code) => {
  const base = env.publicRsvpBaseUrl || 'http://localhost:3000';
  return `${String(base).replace(/\/$/, '')}/rsvp/${code}`;
};

module.exports = {
  buildPublicRsvpUrl
};
