const Joi = require('joi');

const createEventSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  date: Joi.date().iso().required(),
  location: Joi.string().trim().min(2).max(240).required()
});

const eventIdParamSchema = Joi.object({
  id: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required()
});

const updateEventSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160),
  date: Joi.date().iso(),
  location: Joi.string().trim().min(2).max(240),
  ivrEnabled: Joi.boolean(),
  voiceAiEnabled: Joi.boolean(),
  qrEnabled: Joi.boolean(),
  outreachEnabled: Joi.boolean(),
  outreachAutoStart: Joi.boolean(),
  outreachVoiceDelayHours: Joi.number().integer().min(1).max(48),
  outreachAutoCallMode: Joi.string().valid('ai', 'ivr'),
  outreachReminderEnabled: Joi.boolean(),
  outreachMessageTemplate: Joi.string().allow('', null).max(4000),
  outreachReminderTemplate: Joi.string().allow('', null).max(4000)
}).min(1);

module.exports = {
  createEventSchema,
  eventIdParamSchema,
  updateEventSchema
};
