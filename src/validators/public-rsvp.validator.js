const Joi = require('joi');

const lookupInviteSchema = Joi.object({
  code: Joi.string().trim().min(8).max(128).required()
});

const submitPublicRsvpSchema = Joi.object({
  rsvpStatus: Joi.string().valid('PENDING', 'CONFIRMED', 'DECLINED').required(),
  groupSize: Joi.number().integer().min(1).max(100).required(),
  pickupLocation: Joi.string().trim().max(240).allow(null, ''),
  guestNotes: Joi.string().trim().max(500).allow(null, ''),
  callbackAt: Joi.date().iso().allow(null),
  followUpStatus: Joi.string().valid('NONE', 'NEEDS_FOLLOW_UP', 'CALLBACK_LATER', 'NO_ANSWER', 'VOICEMAIL', 'COMPLETED')
});

module.exports = {
  lookupInviteSchema,
  submitPublicRsvpSchema
};
