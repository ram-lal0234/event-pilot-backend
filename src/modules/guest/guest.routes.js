const express = require('express');
const guestController = require('../../controllers/guest.controller');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createGuestSchema,
  updateGuestSchema,
  guestIdParamSchema,
  guestQuerySchema
} = require('../../validators/guest.validator');

const router = express.Router();

router.use(authenticate);

router.post(
  '/upload-csv',
  express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }),
  validate({ query: guestQuerySchema.fork(['eventId'], (schema) => schema.required()) }),
  guestController.uploadCsv
);

router
  .route('/')
  .post(validate({ body: createGuestSchema }), guestController.createGuest)
  .get(validate({ query: guestQuerySchema }), guestController.listGuests);

router
  .route('/:id')
  .patch(validate({ params: guestIdParamSchema, body: updateGuestSchema }), guestController.updateGuest)
  .delete(validate({ params: guestIdParamSchema }), guestController.deleteGuest);

module.exports = router;
