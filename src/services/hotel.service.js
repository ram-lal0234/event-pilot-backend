const hotelRepository = require('../repositories/hotel.repository');
const guestRepository = require('../repositories/guest.repository');
const eventRepository = require('../repositories/event.repository');
const AppError = require('../utils/AppError');

const createHotel = async (payload, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(payload.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  return hotelRepository.createHotel(payload);
};

const createRoom = async (payload, user) => {
  const hotel = await hotelRepository.findHotelById(payload.hotelId);

  if (!hotel) {
    throw new AppError('Hotel not found', 404, 'HOTEL_NOT_FOUND');
  }

  const hasAccess = await eventRepository.userCanAccessEvent(hotel.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  return hotelRepository.createRoom({
    eventId: hotel.eventId,
    hotelId: payload.hotelId,
    roomNumber: payload.roomNumber,
    capacity: payload.capacity
  });
};

const assignGuest = async ({ roomId, guestId }, user) => {
  const [room, guest] = await Promise.all([
    hotelRepository.findRoomById(roomId),
    guestRepository.findById(guestId)
  ]);

  if (!room || !guest || room.eventId !== guest.eventId) {
    throw new AppError('Room or guest not found for the same event', 404, 'ROOM_ASSIGNMENT_TARGET_NOT_FOUND');
  }

  const hasAccess = await eventRepository.userCanAccessEvent(room.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  const occupied = await hotelRepository.assignedGroupSize(roomId);

  if (occupied + guest.groupSize > room.capacity) {
    throw new AppError('Room capacity exceeded', 409, 'ROOM_CAPACITY_EXCEEDED');
  }

  return hotelRepository.assignGuest({
    eventId: room.eventId,
    roomId,
    guestId
  });
};

module.exports = {
  createHotel,
  createRoom,
  assignGuest
};
