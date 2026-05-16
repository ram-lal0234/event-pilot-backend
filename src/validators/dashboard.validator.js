const Joi = require('joi');

const dashboardQuerySchema = Joi.object({
  eventId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required()
});

module.exports = {
  dashboardQuerySchema
};
