const Joi = require('joi');

const updateAccountSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required()
});

const inviteMemberSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().trim().max(120).allow('', null),
  phone: Joi.string().trim().max(30).allow('', null),
  role: Joi.string().valid('ADMIN', 'STAFF').required(),
  eventAssignments: Joi.array().items(
    Joi.object({
      eventId: Joi.string().uuid().required(),
      accessLevel: Joi.string().valid('FULL', 'READ_ONLY').default('FULL')
    })
  ).default([])
});

const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid('ADMIN', 'STAFF').required()
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

module.exports = {
  updateAccountSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateMemberEventsSchema,
  memberIdParamSchema,
  joinCodeParamSchema
};
