const voiceAiService = require('../services/voice-ai.service');
const response = require('../utils/response');

const applyResult = async (req, res, next) => {
  try {
    const result = await voiceAiService.applyAiResult(req.body);
    response.success(res, result, result.duplicate ? 'RSVP already recorded' : 'RSVP recorded');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyResult
};
