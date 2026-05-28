const hotelRepository = require('../repositories/hotel.repository');
const guestRepository = require('../repositories/guest.repository');
const eventRepository = require('../repositories/event.repository');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');

const createHotel = async (payload, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(payload.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  const hotel = await hotelRepository.createHotel(payload);

  await auditService.enqueueAuditLog({
    eventId: hotel.eventId,
    userId: user.id,
    action: 'HOTEL_CREATED',
    entityType: 'Hotel',
    entityId: hotel.id,
    metadata: {
      name: hotel.name,
      location: hotel.location,
      createdBy: user.id
    }
  });

  return hotel;
};

const listHotels = async ({ eventId }, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  return hotelRepository.findManyByEvent(eventId);
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

  const room = await hotelRepository.createRoom({
    hotelId: payload.hotelId,
    roomNumber: payload.roomNumber,
    capacity: payload.capacity,
    roomType: payload.roomType || null,
    floor: payload.floor || null,
    roomStatus: payload.roomStatus || null,
    checkInDate: payload.checkInDate ? new Date(payload.checkInDate) : null,
    checkOutDate: payload.checkOutDate ? new Date(payload.checkOutDate) : null
  });

  await auditService.enqueueAuditLog({
    eventId: hotel.eventId,
    userId: user.id,
    action: 'ROOM_CREATED',
    entityType: 'Room',
    entityId: room.id,
    metadata: {
      hotelId: hotel.id,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      roomType: room.roomType,
      floor: room.floor,
      roomStatus: room.roomStatus,
      createdBy: user.id
    }
  });

  return room;
};

const assignGuest = async ({ roomId, guestId }, user) => {
  const [room, guest] = await Promise.all([
    hotelRepository.findRoomById(roomId),
    guestRepository.findById(guestId)
  ]);

  if (!room || !guest || room.hotel.eventId !== guest.eventId) {
    throw new AppError('Room or guest not found for the same event', 404, 'ROOM_ASSIGNMENT_TARGET_NOT_FOUND');
  }

  const hasAccess = await eventRepository.userCanAccessEvent(room.hotel.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  if (guest.rsvpStatus !== 'CONFIRMED') {
    throw new AppError('Only confirmed guests can be assigned to a room', 409, 'ROOM_ASSIGNMENT_REQUIRES_CONFIRMED_RSVP');
  }

  const occupied = await hotelRepository.assignedMembers(roomId);

  if (occupied + guest.groupSize > room.capacity) {
    throw new AppError('Room capacity exceeded', 409, 'ROOM_CAPACITY_EXCEEDED');
  }

  const assignment = await hotelRepository.assignGuest({
    eventId: room.hotel.eventId,
    roomId,
    guestId,
    assignedMembers: guest.groupSize
  });

  await auditService.enqueueAuditLog({
    eventId: room.hotel.eventId,
    userId: user.id,
    action: 'GUEST_ASSIGNED_TO_ROOM',
    entityType: 'RoomAssignment',
    entityId: assignment.id,
    metadata: {
      roomId,
      hotelId: room.hotel.id,
      guestId,
      assignedMembers: guest.groupSize,
      assignedBy: user.id
    }
  });

  return assignment;
};

const unassignGuest = async ({ guestId }, user) => {
  const assignment = await hotelRepository.findAssignmentByGuestId(guestId);
  if (!assignment) {
    throw new AppError('Room assignment not found', 404, 'ROOM_ASSIGNMENT_NOT_FOUND');
  }

  const hasAccess = await eventRepository.userCanAccessEvent(assignment.room.hotel.eventId, user);
  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  await hotelRepository.unassignGuest(assignment.id);
  return { id: assignment.id };
};

const moveGuest = async ({ guestId, toRoomId }, user) => {
  const existing = await hotelRepository.findAssignmentByGuestId(guestId);
  if (!existing) {
    throw new AppError('Room assignment not found', 404, 'ROOM_ASSIGNMENT_NOT_FOUND');
  }

  await unassignGuest({ guestId }, user);
  return assignGuest({ roomId: toRoomId, guestId }, user);
};

module.exports = {
  createHotel,
  listHotels,
  createRoom,
  assignGuest,
  unassignGuest,
  moveGuest
};
