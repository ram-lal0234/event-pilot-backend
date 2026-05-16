const Joi = require('joi');

const uuid = Joi.string().guid({ version: ['uuidv4', 'uuidv5'] });

const createCabSchema = Joi.object({
  eventId: uuid.required(),
  driverName: Joi.string().trim().min(2).max(120).required(),
  vehicleNumber: Joi.string().trim().min(2).max(40).required(),
  capacity: Joi.number().integer().min(1).max(200).required()
});

const assignCabSchema = Joi.object({
  cabId: uuid.required(),
  guestId: uuid.required()
});

module.exports = {
  createCabSchema,
  assignCabSchema
};
