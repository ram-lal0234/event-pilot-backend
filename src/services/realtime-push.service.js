const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} = require('@aws-sdk/client-apigatewaymanagementapi');
const prisma = require('../config/db');
const realtimeConnectionRepository = require('../repositories/realtime-connection.repository');
const localHub = require('../local/realtime-local-hub');
const env = require('../config/env');
const { resolveWebsocketManagementEndpoint } = require('../utils/resolve-websocket-endpoint');
const logger = require('../utils/logger');

let managementClient;

const getManagementClient = async () => {
  if (managementClient) {
    return managementClient;
  }

  const endpoint = await resolveWebsocketManagementEndpoint();

  if (!endpoint) {
    return null;
  }

  managementClient = new ApiGatewayManagementApiClient({
    endpoint,
    region: env.awsRegion
  });

  return managementClient;
};

const postToConnection = async (connectionId, data, { endpoint } = {}) => {
  const resolvedEndpoint = endpoint || await resolveWebsocketManagementEndpoint();

  if (!resolvedEndpoint) {
    return { ok: false, reason: 'NO_MANAGEMENT_CLIENT' };
  }

  const client = endpoint
    ? new ApiGatewayManagementApiClient({
      endpoint: resolvedEndpoint,
      region: env.awsRegion
    })
    : await getManagementClient();

  if (!client) {
    return { ok: false, reason: 'NO_MANAGEMENT_CLIENT' };
  }

  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(data))
    }));
    return { ok: true };
  } catch (error) {
    if (error?.name === 'GoneException' || error?.$metadata?.httpStatusCode === 410) {
      await realtimeConnectionRepository.deleteConnection(connectionId).catch(() => {});
      return { ok: false, reason: 'GONE' };
    }
    throw error;
  }
};

const broadcastToAccount = async (accountId, message, { eventId } = {}) => {
  if (!accountId) {
    return { sent: 0, skipped: true };
  }

  const envelope = {
    ...message,
    accountId,
    ts: message.ts || Date.now()
  };

  if (env.realtimeProvider === 'local') {
    return localHub.broadcast(accountId, envelope, { eventId });
  }

  if (!realtimeConnectionRepository.isDynamoEnabled()) {
    return { sent: 0, skipped: true };
  }

  const connections = await realtimeConnectionRepository.listByAccount(accountId);
  const targets = eventId
    ? connections.filter((row) => !row.eventId || row.eventId === eventId)
    : connections;

  const results = await Promise.allSettled(
    targets.map((row) => postToConnection(row.connectionId, envelope))
  );

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;
  const gone = results.filter((r) => r.status === 'fulfilled' && r.value?.reason === 'GONE').length;

  if (sent > 0 || gone > 0) {
    logger.info('Realtime broadcast', {
      accountId,
      eventId: eventId || null,
      type: envelope.type,
      targets: targets.length,
      sent,
      gone
    });
  }

  return { sent, gone, targets: targets.length };
};

const publishForEvent = async (eventId, message) => {
  if (!eventId) {
    return { sent: 0, skipped: true };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { accountId: true }
  });

  if (!event?.accountId) {
    return { sent: 0, skipped: true };
  }

  return broadcastToAccount(event.accountId, { ...message, eventId }, { eventId });
};

/** Fire-and-forget — never block the caller on push latency */
const publishForEventAsync = (eventId, message) => {
  void publishForEvent(eventId, message).catch((error) => {
    logger.error(error, { eventId, type: message?.type });
  });
};

const broadcastToAccountAsync = (accountId, message, options = {}) => {
  void broadcastToAccount(accountId, message, options).catch((error) => {
    logger.error(error, { accountId, type: message?.type });
  });
};

module.exports = {
  broadcastToAccount,
  broadcastToAccountAsync,
  publishForEvent,
  publishForEventAsync,
  postToConnection
};
