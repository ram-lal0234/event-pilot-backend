const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const qrController = require('../../controllers/qr.controller');
const { scanQrSchema } = require('../../validators/qr.validator');

const router = express.Router();

router.post('/scan', authenticate, validate({ body: scanQrSchema }), qrController.scan);

module.exports = router;
