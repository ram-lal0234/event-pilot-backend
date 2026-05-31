const Joi = require('joi');

const updateAccountSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().max(120).allow('', null),
  phone: Joi.string().trim().max(30).allow('', null)
}).min(1);

const completeOnboardingSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().min(8).max(30).required(),
  workspaceName: Joi.string().trim().min(2).max(120).optional()
});

const inviteMemberSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().trim().max(120).allow('', null),
  phone: Joi.string().trim().max(30).allow('', null),
  role: Joi.string().valid('ADMIN', 'STAFF', 'DRIVER', 'HOTEL').required(),
  eventAssignments: Joi.array().items(
    Joi.object({
      eventId: Joi.string().uuid().required(),
      accessLevel: Joi.string().valid('FULL', 'READ_ONLY').default('FULL')
    })
  ).default([])
});

const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid('ADMIN', 'STAFF', 'DRIVER', 'HOTEL').required()
});

const updateMemberEventsSchema = Joi.object({
  eventAssignments: Joi.array().items(
    Joi.object({
      eventId: Joi.string().uuid().required(),
      accessLevel: Joi.string().valid('FULL', 'READ_ONLY').default('FULL')
    })
  ).required()
});

const memberIdParamSchema = Joi.object({
  id: Joi.string().uuid().required()
});

const joinCodeParamSchema = Joi.object({
  code: Joi.string().min(8).max(64).required()
});

const joinVerifyOtpSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required()
});

module.exports = {
  updateAccountSchema,
  updateProfileSchema,
  completeOnboardingSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateMemberEventsSchema,
  memberIdParamSchema,
  joinCodeParamSchema,
  joinVerifyOtpSchema
};
