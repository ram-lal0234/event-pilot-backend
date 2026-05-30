const fromShared = require('./shared');

const { verifyRealtimeToken } = fromShared('utils/realtime-auth');
const { normalizeClientId } = fromShared('utils/realtime-client-id');
const realtimeConnectionRepository = fromShared('repositories/realtime-connection.repository');
const { replaceStaleClientConnections } = fromShared('services/realtime-connection-lifecycle.service');
const realtimePush = fromShared('services/realtime-push.service');
const logger = fromShared('utils/logger');

const parseBody = (event) => {
  if (!event?.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
};

const buildManagementEndpoint = (event) => {
  const { domainName, stage } = event.requestContext || {};

  if (!domainName || !stage) {
    return undefined;
  }

  return `https://${domainName}/${stage}`;
};

const connect = async (event) => {
  const connectionId = event.requestContext?.connectionId;

  if (!connectionId) {
    return { statusCode: 500, body: 'Missing connectionId' };
  }

  const query = event.queryStringParameters || {};
  const token = query.token || query.Token;
  const clientId = normalizeClientId(query.clientId || query.client_id);

  const auth = verifyRealtimeToken(token);

  if (!auth) {
    logger.warn('WebSocket connect rejected — invalid token');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  if (!clientId) {
    logger.warn('WebSocket connect rejected — missing or invalid clientId');
    return { statusCode: 400, body: 'clientId required (UUID)' };
  }

  if (realtimeConnectionRepository.isDynamoEnabled()) {
    await replaceStaleClientConnections({
      accountId: auth.accountId,
      clientId,
      keepConnectionId: connectionId,
      managementEndpoint: buildManagementEndpoint(event)
    });

    await realtimeConnectionRepository.putConnection({
      connectionId,
      accountId: auth.accountId,
      userId: auth.userId,
      clientId,
      eventId: query.eventId || null
    });
  }

  logger.info('WebSocket connected', {
    connectionId,
    accountId: auth.accountId,
    userId: auth.userId,
    clientId
  });

  return { statusCode: 200, body: 'Connected' };
};

const disconnect = async (event) => {
  const connectionId = event.requestContext?.connectionId;

  if (connectionId && realtimeConnectionRepository.isDynamoEnabled()) {
    await realtimeConnectionRepository.deleteConnection(connectionId);
  }

  return { statusCode: 200, body: 'Disconnected' };
};

const defaultHandler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  const body = parseBody(event);
  const action = body.action || body.type;

  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connectionId' };
  }

  if (action === 'ping') {
    if (realtimeConnectionRepository.isDynamoEnabled()) {
      await realtimeConnectionRepository.touchConnection(connectionId).catch(() => {});
    }

    await realtimePush.postToConnection(connectionId, {
      type: 'pong',
      ts: Date.now()
    }, { endpoint: buildManagementEndpoint(event) });

    return { statusCode: 200, body: 'OK' };
  }

  if (action === 'subscribe' && body.eventId) {
    if (realtimeConnectionRepository.isDynamoEnabled()) {
      await realtimeConnectionRepository.updateEventSubscription(connectionId, body.eventId);
    }

    await realtimePush.postToConnection(connectionId, {
      type: 'subscribed',
      eventId: body.eventId,
      ts: Date.now()
    }, { endpoint: buildManagementEndpoint(event) });

    return { statusCode: 200, body: 'OK' };
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unknown action' })
  };
};

module.exports = {
  connect,
  disconnect,
  defaultHandler
};
