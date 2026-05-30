/** In-process WebSocket fan-out for REALTIME_PROVIDER=local */

const connections = new Map();

const register = (connectionId, meta, send, ws) => {
  connections.set(connectionId, { ...meta, send, ws });
};

const unregister = (connectionId) => {
  connections.delete(connectionId);
};

const setEventId = (connectionId, eventId) => {
  const row = connections.get(connectionId);
  if (row) {
    row.eventId = eventId || null;
    row.lastSeenAt = Date.now();
  }
};

const touch = (connectionId) => {
  const row = connections.get(connectionId);
  if (row) {
    row.lastSeenAt = Date.now();
  }
};

/**
 * Close older sockets for the same account + browser clientId.
 */
const replaceStaleClientConnections = ({ accountId, clientId, keepConnectionId }) => {
  let removed = 0;

  for (const [connectionId, row] of connections.entries()) {
    if (row.accountId !== accountId || row.clientId !== clientId) {
      continue;
    }

    if (connectionId === keepConnectionId) {
      continue;
    }

    try {
      row.send(JSON.stringify({
        type: 'replaced',
        reason: 'new_session_same_client',
        ts: Date.now()
      }));
      row.ws?.close(4000, 'Replaced by new connection');
    } catch {
      // ignore
    }

    connections.delete(connectionId);
    removed += 1;
  }

  return { removed };
};

const broadcast = (accountId, message, { eventId } = {}) => {
  const payload = JSON.stringify(message);
  let sent = 0;

  for (const [connectionId, row] of connections.entries()) {
    if (row.accountId !== accountId) {
      continue;
    }

    if (eventId && row.eventId && row.eventId !== eventId) {
      continue;
    }

    try {
      row.send(payload);
      sent += 1;
    } catch {
      connections.delete(connectionId);
    }
  }

  return { sent, failed: 0 };
};

module.exports = {
  register,
  unregister,
  setEventId,
  touch,
  replaceStaleClientConnections,
  broadcast,
  connectionCount: () => connections.size
};
