const express = require('express');
const outreachController = require('../../controllers/outreach.controller');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { guestOutreachParamSchema } = require('../../validators/outreach.validator');

const router = express.Router();

router.use(authenticate);

router.post(
  '/:id/outreach/start',
  validate({ params: guestOutreachParamSchema }),
  outreachController.startGuest
);

router.post(
  '/:id/outreach/pause',
  validate({ params: guestOutreachParamSchema }),
  outreachController.pauseGuest
);

router.post(
  '/:id/outreach/resend',
  validate({ params: guestOutreachParamSchema }),
  outreachController.resendInitial
);

module.exports = router;
