const { randomUUID } = require('crypto');
const env = require('../config/env');

let documentClient;

/** In-memory audit feed for local development (QUEUE_PROVIDER=local). */
const localAuditByEvent = new Map();

const getDocumentClient = () => {
  if (!documentClient) {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: env.awsRegion }), {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });
  }

  return documentClient;
};

const getTableName = () => {
  if (!env.auditLogTableName) {
    throw new Error('AUDIT_LOG_TABLE_NAME is required for DynamoDB audit logs');
  }

  return env.auditLogTableName;
};

const toAuditRecord = (item) => ({
  id: item.id,
  eventId: item.eventId,
  userId: item.userId,
  action: item.action,
  entityType: item.entityType,
  entityId: item.entityId,
  metadata: item.metadata || null,
  createdAt: item.createdAt
});

const createLocal = ({ eventId, userId, action, entityType, entityId, metadata = {} }) => {
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const item = {
    id,
    eventId: eventId || null,
    userId: userId || null,
    action,
    entityType,
    entityId,
    metadata,
    createdAt
  };

  if (eventId) {
    const existing = localAuditByEvent.get(eventId) || [];
    localAuditByEvent.set(eventId, [item, ...existing].slice(0, 100));
  }

  return item;
};

const findByEventLocal = (eventId, limit = 25) => {
  const items = localAuditByEvent.get(eventId) || [];
  return items.slice(0, limit).map(toAuditRecord);
};

const create = async ({ eventId, userId, action, entityType, entityId, metadata = {} }) => {
  if (env.queueProvider === 'local') {
    return createLocal({ eventId, userId, action, entityType, entityId, metadata });
  }

  const { PutCommand } = require('@aws-sdk/lib-dynamodb');
  const createdAt = new Date().toISOString();
  const id = randomUUID();

  const item = {
    pk: eventId ? `EVENT#${eventId}` : `GLOBAL#${id}`,
    sk: `AUDIT#${createdAt}#${id}`,
    id,
    eventId: eventId || null,
    userId: userId || null,
    action,
    entityType,
    entityId,
    metadata,
    createdAt,
    gsi1pk: entityType && entityId ? `ENTITY#${entityType}#${entityId}` : undefined,
    gsi1sk: `AUDIT#${createdAt}#${id}`
  };

  await getDocumentClient().send(new PutCommand({
    TableName: getTableName(),
    Item: item
  }));

  return item;
};

const findByEvent = async (eventId, limit = 25) => {
  if (env.queueProvider === 'local') {
    return findByEventLocal(eventId, limit);
  }

  const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

  const result = await getDocumentClient().send(new QueryCommand({
    TableName: getTableName(),
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': `EVENT#${eventId}`
    },
    ScanIndexForward: false,
    Limit: limit
  }));

  return (result.Items || []).map(toAuditRecord);
};

module.exports = {
  create,
  createLocal,
  findByEvent,
  findByEventLocal
};
