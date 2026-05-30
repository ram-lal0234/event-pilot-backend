const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const ivrController = require('../../controllers/ivr.controller');
const { triggerBulkIvrSchema, triggerIvrSchema } = require('../../validators/ivr.validator');

const router = express.Router();

router.post('/call', authenticate, validate({ body: triggerIvrSchema }), ivrController.triggerCall);
router.post('/call-all', authenticate, validate({ body: triggerBulkIvrSchema }), ivrController.triggerBulkCall);

module.exports = router;
