const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const hotelController = require('../../controllers/hotel.controller');
const {
  createHotelSchema,
  createRoomSchema,
  assignRoomSchema
} = require('../../validators/hotel.validator');

const router = express.Router();

router.use(authenticate);
router.post('/', validate({ body: createHotelSchema }), hotelController.createHotel);
router.post('/rooms', validate({ body: createRoomSchema }), hotelController.createRoom);
router.post('/room-assignments', validate({ body: assignRoomSchema }), hotelController.assignGuest);

module.exports = router;
