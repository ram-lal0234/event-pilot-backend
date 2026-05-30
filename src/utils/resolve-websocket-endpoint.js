const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const env = require('../config/env');
const logger = require('./logger');

let cachedEndpoint;
let resolvePromise;

const buildEndpoint = (apiId) => {
  const stage = env.realtime?.apiStage || 'dev';
  const region = env.awsRegion;

  return `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`;
};

const resolveWebsocketManagementEndpoint = async () => {
  if (cachedEndpoint) {
    return cachedEndpoint;
  }

  if (env.realtime?.apiEndpoint) {
    cachedEndpoint = env.realtime.apiEndpoint;
    return cachedEndpoint;
  }

  const parameterName = env.realtime?.apiSsmParameter;

  if (!parameterName) {
    return undefined;
  }

  if (!resolvePromise) {
    resolvePromise = (async () => {
      const ssm = new SSMClient({ region: env.awsRegion });
      const result = await ssm.send(new GetParameterCommand({ Name: parameterName }));
      const apiId = result.Parameter?.Value;

      if (!apiId) {
        throw new Error(`SSM parameter ${parameterName} is empty`);
      }

      cachedEndpoint = buildEndpoint(apiId);
      return cachedEndpoint;
    })().catch((error) => {
      resolvePromise = null;
      logger.error(error, { parameterName });
      throw error;
    });
  }

  return resolvePromise;
};

module.exports = {
  resolveWebsocketManagementEndpoint,
  resetWebsocketEndpointCache: () => {
    cachedEndpoint = undefined;
    resolvePromise = null;
  }
};
