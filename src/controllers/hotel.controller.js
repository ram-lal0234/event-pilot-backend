const hotelService = require('../services/hotel.service');
const response = require('../utils/response');

const createHotel = async (req, res, next) => {
  try {
    const hotel = await hotelService.createHotel(req.body, req.user);
    response.created(res, hotel, 'Hotel created successfully');
  } catch (error) {
    next(error);
  }
};

const createRoom = async (req, res, next) => {
  try {
    const room = await hotelService.createRoom(req.body, req.user);
    response.created(res, room, 'Room created successfully');
  } catch (error) {
    next(error);
  }
};

const assignGuest = async (req, res, next) => {
  try {
    const assignment = await hotelService.assignGuest(req.body, req.user);
    response.created(res, assignment, 'Guest assigned to room');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createHotel,
  createRoom,
  assignGuest
};
