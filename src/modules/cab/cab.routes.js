const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const cabController = require('../../controllers/cab.controller');
const { createCabSchema, assignCabSchema } = require('../../validators/cab.validator');

const router = express.Router();

router.use(authenticate);
router.post('/', validate({ body: createCabSchema }), cabController.createCab);
router.post('/assignments', validate({ body: assignCabSchema }), cabController.assignGuest);

module.exports = router;
