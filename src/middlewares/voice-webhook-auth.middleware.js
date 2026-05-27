const env = require('../config/env');
const AppError = require('../utils/AppError');

const voiceWebhookAuth = (req, res, next) => {
  if (!env.voiceAiWebhookSecret) {
    return next();
  }

  const provided = req.get('x-eventpilot-voice-secret');

  if (provided !== env.voiceAiWebhookSecret) {
    return next(new AppError('Invalid voice webhook secret', 401, 'VOICE_WEBHOOK_UNAUTHORIZED'));
  }

  return next();
};

module.exports = voiceWebhookAuth;
