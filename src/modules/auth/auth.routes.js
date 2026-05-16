const express = require('express');
const authController = require('../../controllers/auth.controller');
const validate = require('../../middlewares/validate.middleware');
const { loginSchema, verifyOtpSchema } = require('../../validators/auth.validator');

const router = express.Router();

router.post('/login', validate({ body: loginSchema }), authController.login);
router.post('/verify-otp', validate({ body: verifyOtpSchema }), authController.verifyOtp);

module.exports = router;
