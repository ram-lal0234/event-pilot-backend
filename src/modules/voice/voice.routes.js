const express = require('express');
const validate = require('../../middlewares/validate.middleware');
const voiceWebhookAuth = require('../../middlewares/voice-webhook-auth.middleware');
const voiceIvrController = require('../../controllers/voice-ivr.controller');
const voiceAiController = require('../../controllers/voice-ai.controller');
const { aiResultSchema } = require('../../validators/voice-ai.validator');

const router = express.Router();

router.all('/ivr/answer', voiceIvrController.answer);
router.all('/ivr/digit', voiceIvrController.digit);
router.post('/ai/result', voiceWebhookAuth, validate({ body: aiResultSchema }), voiceAiController.applyResult);

module.exports = router;
