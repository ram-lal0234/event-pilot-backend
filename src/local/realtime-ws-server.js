const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');
const { verifyRealtimeToken } = require('../utils/realtime-auth');
const { normalizeClientId } = require('../utils/realtime-client-id');
const localHub = require('./realtime-local-hub');
const logger = require('../utils/logger');

const startRealtimeWsServer = (port) => {
  const wss = new WebSocketServer({ port, path: '/' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const token = url.searchParams.get('token');
    const clientId = normalizeClientId(url.searchParams.get('clientId'));
    const auth = verifyRealtimeToken(token);

    if (!auth) {
      ws.close(4401, 'Unauthorized');
      return;
    }

    if (!clientId) {
      ws.close(4400, 'clientId required');
      return;
    }

    const connectionId = randomUUID();
    let eventId = url.searchParams.get('eventId') || null;

    localHub.replaceStaleClientConnections({
      accountId: auth.accountId,
      clientId,
      keepConnectionId: connectionId
    });

    const send = (payload) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    };

    localHub.register(connectionId, {
      accountId: auth.accountId,
      userId: auth.userId,
      clientId,
      eventId
    }, send, ws);

    ws.send(JSON.stringify({
      type: 'connected',
      connectionId,
      clientId,
      ts: Date.now()
    }));

    ws.on('message', (raw) => {
      try {
        const body = JSON.parse(String(raw));

        if (body.action === 'ping') {
          localHub.touch(connectionId);
          send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          return;
        }

        if (body.action === 'subscribe' && body.eventId) {
          eventId = body.eventId;
          localHub.setEventId(connectionId, eventId);
          send(JSON.stringify({
            type: 'subscribed',
            eventId,
            ts: Date.now()
          }));
        }
      } catch {
        // ignore malformed client messages
      }
    });

    ws.on('close', () => {
      localHub.unregister(connectionId);
    });

    logger.info('Local WebSocket client connected', {
      connectionId,
      accountId: auth.accountId,
      clientId
    });
  });

  logger.info(`Local realtime WebSocket listening on ws://127.0.0.1:${port}`);

  return wss;
};

module.exports = {
  startRealtimeWsServer
};
