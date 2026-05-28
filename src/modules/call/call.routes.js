const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const callController = require('../../controllers/call.controller');
const { triggerIvrSchema } = require('../../validators/ivr.validator');
const { uuidParam } = require('../../validators/common.validator');

const router = express.Router();

router.post('/start', authenticate, validate({ body: triggerIvrSchema }), callController.startCall);
router.get('/status/:id', authenticate, validate({ params: uuidParam() }), callController.getCallStatus);

module.exports = router;
