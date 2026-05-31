const Joi = require('joi');

const startBatchSchema = Joi.object({});

const guestOutreachParamSchema = Joi.object({
  id: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required()
});

const eventOutreachParamSchema = Joi.object({
  id: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required()
});

module.exports = {
  startBatchSchema,
  guestOutreachParamSchema,
  eventOutreachParamSchema
};
