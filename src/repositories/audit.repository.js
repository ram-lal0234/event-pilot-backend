const { randomUUID } = require('crypto');
const env = require('../config/env');

let documentClient;

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

const create = async ({ eventId, userId, action, entityType, entityId, metadata = {} }) => {
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

  return (result.Items || []).map((item) => ({
    id: item.id,
    eventId: item.eventId,
    userId: item.userId,
    action: item.action,
    entityType: item.entityType,
    entityId: item.entityId,
    metadata: item.metadata || null,
    createdAt: item.createdAt
  }));
};

module.exports = {
  create,
  findByEvent
};
