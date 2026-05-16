const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required()
});

const verifyOtpSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required()
});

module.exports = {
  loginSchema,
  verifyOtpSchema
};
