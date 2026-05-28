const plivoWebhookIngress = require('../services/plivo-webhook-ingress.service');
const voiceAiService = require('../services/voice-ai.service');
const response = require('../utils/response');
const logger = require('../utils/logger');

const applyResult = async (req, res, next) => {
  try {
    logger.info('POST /api/voice/ai/result (legacy → queue)', {
      hasSecretHeader: Boolean(req.get('x-eventpilot-voice-secret'))
    });

    const route = plivoWebhookIngress.detectAiRoute(req.body);
    const result = await plivoWebhookIngress.enqueuePlivoWebhook({
      route,
      body: req.body,
      query: req.query,
      headers: req.headers
    });

    // Legacy path: /api/voice/ai/result — prefer dedicated /webhook/plivo/ai/* URLs in Plivo.

    if (result.queued) {
      response.success(res, { route, queued: true }, 'Webhook accepted');
      return;
    }

    const processed = result.result || {};
    const message = processed.kind === 'lifecycle'
      ? 'Call lifecycle event recorded'
      : processed.duplicate
        ? 'RSVP already recorded'
        : 'RSVP recorded';

    response.success(res, processed, message);
  } catch (error) {
    next(error);
  }
};

const enqueueAiRoute = async (req, res, next, route) => {
  try {
    const result = await plivoWebhookIngress.enqueuePlivoWebhook({
      route,
      body: req.body,
      query: req.query,
      headers: req.headers
    });

    if (result.queued) {
      response.success(res, { route, queued: true }, 'Webhook accepted');
      return;
    }

    response.success(res, result.result || result, 'Webhook processed');
  } catch (error) {
    next(error);
  }
};

const applyRsvp = (req, res, next) => enqueueAiRoute(req, res, next, 'ai/rsvp');

module.exports = {
  applyResult,
  applyRsvp
};
