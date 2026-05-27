const env = require('../config/env');

const appendQuery = (url, params) => {
  const nextUrl = new URL(url);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      nextUrl.searchParams.set(key, value);
    }
  });

  return nextUrl.toString();
};

const getWebhookUrl = (params = {}) => {
  if (env.plivo.webhookUrl) {
    return appendQuery(env.plivo.webhookUrl, params);
  }

  if (env.publicApiUrl) {
    return appendQuery(`${env.publicApiUrl.replace(/\/$/, '')}/webhook/plivo`, params);
  }

  return undefined;
};

const assertConfigured = () => {
  if (!env.plivo.authId || !env.plivo.authToken || !env.plivo.fromNumber) {
    throw new Error('Plivo is not configured. Set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, and PLIVO_FROM_NUMBER.');
  }

  if (!env.plivo.answerUrl) {
    throw new Error('Plivo answer URL is not configured. Set PLIVO_ANSWER_URL.');
  }
};

const makeOutboundCall = async ({ callId, phone }) => {
  assertConfigured();

  const webhookUrl = getWebhookUrl({ callId });
  const response = await fetch(`https://api.plivo.com/v1/Account/${env.plivo.authId}/Call/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.plivo.authId}:${env.plivo.authToken}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.plivo.fromNumber,
      to: phone,
      answer_url: env.plivo.answerUrl,
      answer_method: 'POST',
      ...(webhookUrl ? {
        ring_url: webhookUrl,
        ring_method: 'POST',
        hangup_url: webhookUrl,
        hangup_method: 'POST'
      } : {})
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Plivo call failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
};

module.exports = {
  makeOutboundCall
};
