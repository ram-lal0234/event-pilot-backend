const Joi = require('joi');

const uuid = Joi.string().guid({ version: ['uuidv4', 'uuidv5'] });

const createCabSchema = Joi.object({
  eventId: uuid.required(),
  driverName: Joi.string().trim().min(2).max(120).required(),
  driverPhone: Joi.string().trim().min(8).max(20).allow(null, ''),
  vehicleNumber: Joi.string().trim().min(2).max(40).required(),
  capacity: Joi.number().integer().min(1).max(200).required(),
  pickupTime: Joi.date().iso().allow(null),
  routeZone: Joi.string().trim().max(120).allow(null, ''),
  tripStatus: Joi.string().trim().max(40).allow(null, '')
});

const assignCabSchema = Joi.object({
  cabId: uuid.required(),
  guestId: uuid.required()
});

const unassignCabSchema = Joi.object({
  guestId: uuid.required()
});

const moveCabSchema = Joi.object({
  guestId: uuid.required(),
  toCabId: uuid.required()
});

module.exports = {
  createCabSchema,
  assignCabSchema,
  unassignCabSchema,
  moveCabSchema
};
