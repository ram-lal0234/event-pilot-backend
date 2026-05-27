const Joi = require('joi');

const aiResultSchema = Joi.object({
  guestId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }),
  guest_id: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }),
  rsvpStatus: Joi.string().valid('CONFIRMED', 'DECLINED', 'PENDING'),
  rsvp_status: Joi.string().valid('CONFIRMED', 'DECLINED', 'PENDING'),
  groupSize: Joi.number().integer().min(1).max(100),
  group_size: Joi.number().integer().min(1).max(100),
  pickupLocation: Joi.string().trim().max(500).allow('', null),
  pickup_location: Joi.string().trim().max(500).allow('', null),
  needsCab: Joi.boolean(),
  needs_cab: Joi.boolean(),
  needsHotel: Joi.boolean(),
  needs_hotel: Joi.boolean(),
  guestNotes: Joi.string().trim().max(2000).allow('', null),
  guest_notes: Joi.string().trim().max(2000).allow('', null),
  language: Joi.string().trim().max(20).allow('', null),
  callOutcome: Joi.string().valid(
    'completed',
    'declined',
    'maybe',
    'callback_later',
    'wrong_person',
    'opted_out',
    'voicemail',
    'no_answer'
  ),
  call_outcome: Joi.string().valid(
    'completed',
    'declined',
    'maybe',
    'callback_later',
    'wrong_person',
    'opted_out',
    'voicemail',
    'no_answer'
  ),
  callStatus: Joi.string().trim().max(80),
  call_status: Joi.string().trim().max(80),
  attempt: Joi.number().integer().min(1).max(20),
  callDuration: Joi.number().integer().min(0).max(86400),
  call_duration: Joi.number().integer().min(0).max(86400)
}).or('guestId', 'guest_id');

module.exports = {
  aiResultSchema
};
