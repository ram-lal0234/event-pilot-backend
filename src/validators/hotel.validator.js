const Joi = require('joi');

const uuid = Joi.string().guid({ version: ['uuidv4', 'uuidv5'] });

const createHotelSchema = Joi.object({
  eventId: uuid.required(),
  name: Joi.string().trim().min(2).max(160).required(),
  location: Joi.string().trim().min(2).max(240).required()
});

const createRoomSchema = Joi.object({
  hotelId: uuid.required(),
  roomNumber: Joi.string().trim().min(1).max(40).required(),
  capacity: Joi.number().integer().min(1).max(20).required()
});

const assignRoomSchema = Joi.object({
  roomId: uuid.required(),
  guestId: uuid.required()
});

module.exports = {
  createHotelSchema,
  createRoomSchema,
  assignRoomSchema
};
