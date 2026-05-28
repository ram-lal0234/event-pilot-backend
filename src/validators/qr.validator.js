const Joi = require('joi');

const scanQrSchema = Joi.object({
  qrCode: Joi.string().trim().required(),
  method: Joi.string().valid('QR', 'MANUAL').default('QR'),
  locationType: Joi.string().valid('EVENT_GATE', 'HOTEL').default('EVENT_GATE')
});

const undoCheckinSchema = Joi.object({
  qrCode: Joi.string().trim().required(),
  locationType: Joi.string().valid('EVENT_GATE', 'HOTEL')
});

module.exports = {
  scanQrSchema,
  undoCheckinSchema
};
