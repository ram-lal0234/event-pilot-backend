const Joi = require('joi');

const scanQrSchema = Joi.object({
  qrCode: Joi.string().trim().required(),
  method: Joi.string().valid('QR', 'MANUAL').default('QR')
});

module.exports = {
  scanQrSchema
};
