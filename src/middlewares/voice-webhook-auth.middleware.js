const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const {
  logPlivoWebhookAuthDebug,
  getPlivoAuthHeaderDebug
} = require('../services/plivo-webhook-auth.service');

const voiceWebhookAuth = (req, res, next) => {
  logPlivoWebhookAuthDebug({
    route: `express${req.path}`,
    authMode: 'voice-secret',
    headers: req.headers,
    publicUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    bodyParams: req.body
  });

  if (!env.voiceAiWebhookSecret) {
    return next();
  }

  const provided = req.get('x-eventpilot-voice-secret');

  if (provided !== env.voiceAiWebhookSecret) {
    logger.warn('Voice webhook unauthorized: configure Plivo to send X-EventPilot-Voice-Secret or unset VOICE_AI_WEBHOOK_SECRET on Lambda', {
      path: req.path,
      plivoHeaders: getPlivoAuthHeaderDebug(req.headers),
      hasSecretHeader: Boolean(provided)
    });
    return next(new AppError(
      'Invalid or missing X-EventPilot-Voice-Secret header. Add it in Plivo flow HTTP actions or unset VOICE_AI_WEBHOOK_SECRET.',
      401,
      'VOICE_WEBHOOK_UNAUTHORIZED'
    ));
  }

  return next();
};

module.exports = voiceWebhookAuth;
