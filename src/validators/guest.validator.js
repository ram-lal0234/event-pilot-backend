const Joi = require('joi');

const uuid = Joi.string().guid({ version: ['uuidv4', 'uuidv5'] });

const createGuestSchema = Joi.object({
  eventId: uuid.required(),
  name: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().min(8).max(20).required(),
  email: Joi.string().trim().email().allow(null, ''),
  category: Joi.string().valid('VIP', 'FAMILY', 'GENERAL').default('GENERAL'),
  groupSize: Joi.number().integer().min(1).max(100).default(1)
});

const updateGuestSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  phone: Joi.string().trim().min(8).max(20),
  email: Joi.string().trim().email().allow(null, ''),
  category: Joi.string().valid('VIP', 'FAMILY', 'GENERAL'),
  rsvpStatus: Joi.string().valid('PENDING', 'CONFIRMED', 'DECLINED'),
  groupSize: Joi.number().integer().min(1).max(100)
}).min(1);

const guestIdParamSchema = Joi.object({
  id: uuid.required()
});

const guestQuerySchema = Joi.object({
  eventId: uuid.required(),
  rsvpStatus: Joi.string().valid('PENDING', 'CONFIRMED', 'DECLINED'),
  category: Joi.string().valid('VIP', 'FAMILY', 'GENERAL')
});

module.exports = {
  createGuestSchema,
  updateGuestSchema,
  guestIdParamSchema,
  guestQuerySchema
};
