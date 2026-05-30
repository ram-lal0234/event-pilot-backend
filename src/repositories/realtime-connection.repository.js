const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand
} = require('@aws-sdk/lib-dynamodb');
const env = require('../config/env');
const { buildAccountClientKey } = require('../utils/realtime-client-id');

const CONNECTION_TTL_SECONDS = 60 * 60 * 24;

const client = new DynamoDBClient({ region: env.awsRegion });
const doc = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const tableName = () => env.realtime?.connectionsTableName;

const isDynamoEnabled = () => (
  env.realtimeProvider === 'apigateway' && Boolean(tableName())
);

const ttlEpoch = () => Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;

const putConnection = async ({
  connectionId,
  accountId,
  userId,
  clientId = null,
  eventId = null
}) => {
  const accountClientKey = clientId ? buildAccountClientKey(accountId, clientId) : null;

  await doc.send(new PutCommand({
    TableName: tableName(),
    Item: {
      connectionId,
      accountId,
      userId,
      clientId: clientId || null,
      accountClientKey,
      eventId: eventId || null,
      connectedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      ttl: ttlEpoch()
    }
  }));
};

const deleteConnection = async (connectionId) => {
  await doc.send(new DeleteCommand({
    TableName: tableName(),
    Key: { connectionId }
  }));
};

const touchConnection = async (connectionId) => {
  await doc.send(new UpdateCommand({
    TableName: tableName(),
    Key: { connectionId },
    UpdateExpression: 'SET lastSeenAt = :now, #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':now': new Date().toISOString(),
      ':ttl': ttlEpoch()
    }
  }));
};

const updateEventSubscription = async (connectionId, eventId) => {
  await doc.send(new UpdateCommand({
    TableName: tableName(),
    Key: { connectionId },
    UpdateExpression: 'SET eventId = :eventId, lastSeenAt = :now, #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':eventId': eventId || null,
      ':now': new Date().toISOString(),
      ':ttl': ttlEpoch()
    }
  }));
};

const listByAccount = async (accountId) => {
  const result = await doc.send(new QueryCommand({
    TableName: tableName(),
    IndexName: 'accountId-index',
    KeyConditionExpression: 'accountId = :accountId',
    ExpressionAttributeValues: {
      ':accountId': accountId
    }
  }));

  return result.Items || [];
};

const listByAccountClient = async (accountId, clientId) => {
  const accountClientKey = buildAccountClientKey(accountId, clientId);

  const result = await doc.send(new QueryCommand({
    TableName: tableName(),
    IndexName: 'accountClient-index',
    KeyConditionExpression: 'accountClientKey = :accountClientKey',
    ExpressionAttributeValues: {
      ':accountClientKey': accountClientKey
    }
  }));

  return result.Items || [];
};

module.exports = {
  isDynamoEnabled,
  putConnection,
  deleteConnection,
  touchConnection,
  updateEventSubscription,
  listByAccount,
  listByAccountClient
};
