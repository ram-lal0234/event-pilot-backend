const Joi = require('joi');

const rsvpOutcomeValues = [
  'completed',
  'declined',
  'maybe',
  'callback_later',
  'wrong_person',
  'opted_out',
  'voicemail',
  'no_answer'
];

const rsvpFieldsSchema = Joi.object({
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
  callOutcome: Joi.string().valid(...rsvpOutcomeValues),
  call_outcome: Joi.string().valid(...rsvpOutcomeValues),
  callStatus: Joi.string().trim().max(80),
  call_status: Joi.string().trim().max(80),
  attempt: Joi.number().integer().min(1).max(20),
  callDuration: Joi.number().integer().min(0).max(86400),
  call_duration: Joi.number().integer().min(0).max(86400),
  eventType: Joi.string().trim().max(80),
  event_type: Joi.string().trim().max(80),
  callUuid: Joi.string().trim().max(80),
  call_uuid: Joi.string().trim().max(80),
  status: Joi.string().trim().max(80)
}).or('guestId', 'guest_id');

const lifecycleFieldsSchema = Joi.object({
  eventType: Joi.string().trim().max(80),
  event_type: Joi.string().trim().max(80),
  Event: Joi.string().trim().max(80),
  callUuid: Joi.string().trim().max(80),
  call_uuid: Joi.string().trim().max(80),
  CallUUID: Joi.string().trim().max(80),
  CallUuid: Joi.string().trim().max(80),
  status: Joi.string().trim().max(80),
  Status: Joi.string().trim().max(80),
  callStatus: Joi.string().trim().max(80),
  call_status: Joi.string().trim().max(80),
  CallStatus: Joi.string().trim().max(80),
  guestId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }),
  guest_id: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] })
})
  .or('eventType', 'event_type', 'Event', 'status', 'Status', 'callStatus', 'call_status', 'CallStatus')
  .or('callUuid', 'call_uuid', 'CallUUID', 'CallUuid');

// Permissive: Plivo lifecycle payloads vary; unknown keys are stripped but must not fail validation.
const aiResultSchema = Joi.alternatives().try(
  rsvpFieldsSchema.unknown(true),
  lifecycleFieldsSchema.unknown(true)
);

module.exports = {
  aiResultSchema,
  rsvpFieldsSchema,
  lifecycleFieldsSchema
};
