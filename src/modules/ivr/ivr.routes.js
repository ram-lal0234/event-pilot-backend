const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const ivrController = require('../../controllers/ivr.controller');
const { triggerIvrSchema, ivrWebhookSchema } = require('../../validators/ivr.validator');

const router = express.Router();

router.post('/call', authenticate, validate({ body: triggerIvrSchema }), ivrController.triggerCall);
router.post('/webhook', validate({ body: ivrWebhookSchema }), ivrController.webhook);

module.exports = router;
