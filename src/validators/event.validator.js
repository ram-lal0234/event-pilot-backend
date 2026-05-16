const Joi = require('joi');

const createEventSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  date: Joi.date().iso().required(),
  location: Joi.string().trim().min(2).max(240).required()
});

const eventIdParamSchema = Joi.object({
  id: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required()
});

module.exports = {
  createEventSchema,
  eventIdParamSchema
};
