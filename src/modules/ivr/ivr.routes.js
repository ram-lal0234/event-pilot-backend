const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const ivrController = require('../../controllers/ivr.controller');
const { triggerIvrSchema } = require('../../validators/ivr.validator');

const router = express.Router();

router.post('/call', authenticate, validate({ body: triggerIvrSchema }), ivrController.triggerCall);

module.exports = router;
