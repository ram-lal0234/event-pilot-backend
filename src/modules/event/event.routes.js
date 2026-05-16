const express = require('express');
const eventController = require('../../controllers/event.controller');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { createEventSchema } = require('../../validators/event.validator');

const router = express.Router();

router.use(authenticate);
router.post('/', validate({ body: createEventSchema }), eventController.createEvent);
router.get('/', eventController.listEvents);

module.exports = router;
