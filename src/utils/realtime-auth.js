const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Verify JWT from WebSocket $connect query (?token=) or Authorization header.
 * @returns {{ userId: string, accountId: string, memberId?: string, accountRole?: string }}
 */
const verifyRealtimeToken = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload = jwt.verify(token.trim(), env.jwtSecret);

    if (!payload?.sub || !payload?.accountId) {
      return null;
    }

    return {
      userId: payload.sub,
      accountId: payload.accountId,
      memberId: payload.memberId,
      accountRole: payload.accountRole
    };
  } catch {
    return null;
  }
};

module.exports = {
  verifyRealtimeToken
};
