const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const {
  logPlivoWebhookAuthDebug,
  getPlivoAuthHeaderDebug,
  assertVoiceWebhookSecret
} = require('../services/plivo-webhook-auth.service');

const voiceWebhookAuth = (req, res, next) => {
  const route = req.path.includes('rsvp') ? 'ai/rsvp' : 'ai/hangup';

  logPlivoWebhookAuthDebug({
    route: `express${req.path}`,
    authMode: 'voice-secret',
    headers: req.headers,
    query: req.query,
    publicUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    bodyParams: req.body
  });

  const auth = assertVoiceWebhookSecret({
    headers: req.headers,
    query: req.query,
    route,
    body: req.body
  });

  if (auth.ok) {
    return next();
  }

  logger.warn('Voice webhook unauthorized', {
    path: req.path,
    plivoHeaders: getPlivoAuthHeaderDebug(req.headers, req.query),
    reason: auth.reason
  });

  return next(new AppError(
    'Invalid or missing X-EventPilot-Voice-Secret header. Add it in Plivo flow HTTP actions or unset VOICE_AI_WEBHOOK_SECRET.',
    401,
    'VOICE_WEBHOOK_UNAUTHORIZED'
  ));
};

module.exports = voiceWebhookAuth;
