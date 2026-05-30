const realtimeConnectionRepository = require('../repositories/realtime-connection.repository');
const realtimePush = require('./realtime-push.service');
const logger = require('../utils/logger');

/**
 * Same browser reconnecting: drop stale registry rows and notify old tabs.
 */
const replaceStaleClientConnections = async ({
  accountId,
  clientId,
  keepConnectionId
}) => {
  if (!accountId || !clientId) {
    return { removed: 0 };
  }

  const stale = await realtimeConnectionRepository.listByAccountClient(accountId, clientId);
  const targets = stale.filter((row) => row.connectionId !== keepConnectionId);

  if (!targets.length) {
    return { removed: 0 };
  }

  await Promise.allSettled(
    targets.map(async (row) => {
      await realtimePush.postToConnection(row.connectionId, {
        type: 'replaced',
        reason: 'new_session_same_client',
        ts: Date.now()
      });
      await realtimeConnectionRepository.deleteConnection(row.connectionId);
    })
  );

  logger.info('Replaced stale realtime connections', {
    accountId,
    clientId,
    removed: targets.length,
    keepConnectionId
  });

  return { removed: targets.length };
};

module.exports = {
  replaceStaleClientConnections
};
