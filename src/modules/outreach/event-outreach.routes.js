const express = require('express');
const outreachController = require('../../controllers/outreach.controller');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { eventIdParamSchema } = require('../../validators/event.validator');
const {
  guestOutreachParamSchema,
  startBatchSchema
} = require('../../validators/outreach.validator');

const router = express.Router({ mergeParams: true });

router.use(authenticate);

router.get(
  '/summary',
  validate({ params: eventIdParamSchema }),
  outreachController.getSummary
);

router.post(
  '/start',
  validate({ params: eventIdParamSchema, body: startBatchSchema }),
  outreachController.startBatch
);

module.exports = router;
