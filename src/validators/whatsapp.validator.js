const Joi = require('joi');
const { guestIdParamSchema } = require('./guest.validator');

const sendGuestWhatsAppSchema = Joi.object({
  message: Joi.string().max(4096).allow('').default(''),
  mediaBase64: Joi.string().max(750_000).allow(null, ''),
  mediaFilename: Joi.string().max(255).allow(null, '')
}).custom((value, helpers) => {
  const hasMessage = Boolean(value.message?.trim());
  const hasMedia = Boolean(value.mediaBase64?.trim());

  if (!hasMessage && !hasMedia) {
    return helpers.error('any.custom', { message: 'Message or media is required' });
  }

  return value;
});

module.exports = {
  sendGuestWhatsAppSchema,
  sendGuestWhatsAppParamSchema: guestIdParamSchema
};
