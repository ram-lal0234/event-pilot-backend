const express = require('express');
const eventController = require('../../controllers/event.controller');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { createEventSchema, eventIdParamSchema, updateEventSchema } = require('../../validators/event.validator');

const router = express.Router();

router.use(authenticate);
router.post('/', validate({ body: createEventSchema }), eventController.createEvent);
router.get('/', eventController.listEvents);
router.get('/:id', validate({ params: eventIdParamSchema }), eventController.getEvent);
router.patch('/:id', validate({ params: eventIdParamSchema, body: updateEventSchema }), eventController.updateEvent);

module.exports = router;
