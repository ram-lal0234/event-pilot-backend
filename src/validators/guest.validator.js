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
  groupSize: Joi.number().integer().min(1).max(100).default(1)
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
  groupSize: Joi.number().integer().min(1).max(100)
}).min(1);

const updateGuestRsvpSchema = Joi.object({
  rsvpStatus: Joi.string().valid('PENDING', 'CONFIRMED', 'DECLINED').required(),
  groupSize: Joi.number().integer().min(1).max(100).required()
});

const guestIdParamSchema = Joi.object({
  id: uuid.required()
});

const guestQuerySchema = Joi.object({
  eventId: uuid.required(),
  rsvpStatus: Joi.string().valid('PENDING', 'CONFIRMED', 'DECLINED'),
  category: Joi.string().valid('VIP', 'FAMILY', 'GENERAL'),
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
