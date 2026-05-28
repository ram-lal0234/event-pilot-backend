const env = require('../config/env');

const buildJoinUrl = (inviteCode) => {
  const base = String(env.publicAppUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/join/${inviteCode}`;
};

module.exports = {
  buildJoinUrl
};
