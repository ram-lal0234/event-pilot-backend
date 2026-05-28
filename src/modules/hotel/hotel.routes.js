const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const hotelController = require('../../controllers/hotel.controller');
const { dashboardQuerySchema } = require('../../validators/dashboard.validator');
const {
  createHotelSchema,
  createRoomSchema,
  assignRoomSchema,
  unassignRoomSchema,
  moveRoomSchema
} = require('../../validators/hotel.validator');

const router = express.Router();

router.use(authenticate);
router
  .route('/')
  .post(validate({ body: createHotelSchema }), hotelController.createHotel)
  .get(validate({ query: dashboardQuerySchema }), hotelController.listHotels);
router.post('/rooms', validate({ body: createRoomSchema }), hotelController.createRoom);
router.post('/room-assignments', validate({ body: assignRoomSchema }), hotelController.assignGuest);
router.post('/room-assignments/unassign', validate({ body: unassignRoomSchema }), hotelController.unassignGuest);
router.post('/room-assignments/move', validate({ body: moveRoomSchema }), hotelController.moveGuest);

module.exports = router;
