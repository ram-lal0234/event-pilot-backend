const express = require('express');
const validate = require('../../middlewares/validate.middleware');
const controller = require('../../controllers/public-rsvp.controller');
const { lookupInviteSchema, submitPublicRsvpSchema } = require('../../validators/public-rsvp.validator');

const router = express.Router();

router.get('/:code', validate({ params: lookupInviteSchema }), controller.getByCode);
router.patch('/:code', validate({ params: lookupInviteSchema, body: submitPublicRsvpSchema }), controller.submit);

module.exports = router;
