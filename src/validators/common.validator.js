const Joi = require('joi');

const uuidParam = (name = 'id') => Joi.object({
  [name]: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required()
});

module.exports = {
  uuidParam
};
