const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const qrController = require('../../controllers/qr.controller');
const { scanQrSchema, undoCheckinSchema } = require('../../validators/qr.validator');

const router = express.Router();

router.post('/scan', authenticate, validate({ body: scanQrSchema }), qrController.scan);
router.post('/undo', authenticate, validate({ body: undoCheckinSchema }), qrController.undo);

module.exports = router;
