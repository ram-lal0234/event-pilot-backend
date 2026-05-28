const Joi = require('joi');

const triggerIvrSchema = Joi.object({
  guestId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required(),
  callMode: Joi.string().valid('ai', 'ivr')
});

const ivrWebhookSchema = Joi.object({
  guestId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required(),
  callStatus: Joi.string().trim().max(80).default('COMPLETED'),
  attempt: Joi.number().integer().min(1).max(20).default(1),
  callDuration: Joi.number().integer().min(0).max(86400),
  responseInput: Joi.string().valid('1', '2').required(),
  groupSize: Joi.number().integer().min(1).max(100)
});

module.exports = {
  triggerIvrSchema,
  ivrWebhookSchema
};
