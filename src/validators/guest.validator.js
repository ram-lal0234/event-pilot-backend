const Joi = require('joi');

const uuid = Joi.string().guid({ version: ['uuidv4', 'uuidv5'] });

const createGuestSchema = Joi.object({
  eventId: uuid.required(),
  name: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().min(8).max(20).required(),
  email: Joi.string().trim().email().allow(null, ''),
  pickupLocation: Joi.string().trim().max(240).allow(null, ''),
  pickupLat: Joi.number().min(-90).max(90),
  pickupLng: Joi.number().min(-180).max(180),
  category: Joi.string().valid('VIP', 'FAMILY', 'GENERAL').default('GENERAL'),
  groupSize: Joi.number().integer().min(1).max(100).default(1),
  needsCab: Joi.boolean().allow(null),
  needsHotel: Joi.boolean().allow(null),
  guestNotes: Joi.string().trim().max(2000).allow(null, ''),
  language: Joi.string().trim().max(40).allow(null, '')
});

const updateGuestSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  phone: Joi.string().trim().min(8).max(20),
  email: Joi.string().trim().email().allow(null, ''),
  pickupLocation: Joi.string().trim().max(240).allow(null, ''),
  pickupLat: Joi.number().min(-90).max(90),
  pickupLng: Joi.number().min(-180).max(180),
  category: Joi.string().valid('VIP', 'FAMILY', 'GENERAL'),
  rsvpStatus: Joi.string().valid('PENDING', 'CONFIRMED', 'DECLINED'),
  groupSize: Joi.number().integer().min(1).max(100),
  followUpStatus: Joi.string().valid('NONE', 'NEEDS_FOLLOW_UP', 'CALLBACK_LATER', 'NO_ANSWER', 'VOICEMAIL', 'COMPLETED'),
  callbackAt: Joi.date().iso().allow(null),
  lastContactedAt: Joi.date().iso().allow(null),
  assignedTo: Joi.string().trim().max(120).allow(null, ''),
  needsCab: Joi.boolean().allow(null),
  needsHotel: Joi.boolean().allow(null),
  guestNotes: Joi.string().trim().max(2000).allow(null, ''),
  language: Joi.string().trim().max(40).allow(null, '')
}).min(1);

const updateGuestRsvpSchema = Joi.object({
  rsvpStatus: Joi.string().valid('PENDING', 'CONFIRMED', 'DECLINED').required(),
  groupSize: Joi.number().integer().min(1).max(100).required()
});

const guestIdParamSchema = Joi.object({
  id: uuid.required()
});

const commaSeparated = (values) => Joi.alternatives().try(
  Joi.string().valid(...values),
  Joi.string().custom((value, helpers) => {
    const items = String(value).split(',').map((item) => item.trim()).filter(Boolean);
    if (!items.length || items.some((item) => !values.includes(item))) {
      return helpers.error('any.invalid');
    }
    return value;
  })
);

const guestQuerySchema = Joi.object({
  eventId: uuid.required(),
  q: Joi.string().trim().max(120).allow(''),
  rsvpStatus: commaSeparated(['PENDING', 'CONFIRMED', 'DECLINED']),
  category: commaSeparated(['VIP', 'FAMILY', 'GENERAL']),
  followUpStatus: commaSeparated(['NONE', 'NEEDS_FOLLOW_UP', 'CALLBACK_LATER', 'NO_ANSWER', 'VOICEMAIL', 'COMPLETED']),
  needsCab: Joi.string().valid('true', 'false'),
  needsHotel: Joi.string().valid('true', 'false'),
  assignedTo: Joi.string().trim().max(120).allow(''),
  page: Joi.number().integer().min(1),
  pageSize: Joi.number().integer().min(1).max(100)
});

module.exports = {
  createGuestSchema,
  updateGuestSchema,
  updateGuestRsvpSchema,
  guestIdParamSchema,
  guestQuerySchema
};
