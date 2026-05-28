const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const joinController = require('../../controllers/join.controller');
const { joinCodeParamSchema } = require('../../validators/account.validator');

const router = express.Router();

router.get('/:code', validate({ params: joinCodeParamSchema }), joinController.getPreview);
router.post('/:code/accept', authenticate, validate({ params: joinCodeParamSchema }), joinController.accept);

module.exports = router;
