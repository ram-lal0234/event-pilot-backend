const cabRepository = require('../repositories/cab.repository');
const guestRepository = require('../repositories/guest.repository');
const eventRepository = require('../repositories/event.repository');
const AppError = require('../utils/AppError');

const createCab = async (payload, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(payload.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  return cabRepository.create({
    eventId: payload.eventId,
    driverName: payload.driverName,
    vehicleNumber: payload.vehicleNumber,
    capacity: payload.capacity
  });
};

const assignGuest = async ({ cabId, guestId }, user) => {
  const [cab, guest] = await Promise.all([
    cabRepository.findById(cabId),
    guestRepository.findById(guestId)
  ]);

  if (!cab || !guest || cab.eventId !== guest.eventId) {
    throw new AppError('Cab or guest not found for the same event', 404, 'CAB_ASSIGNMENT_TARGET_NOT_FOUND');
  }

  const hasAccess = await eventRepository.userCanAccessEvent(cab.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  const occupied = await cabRepository.assignedGroupSize(cabId);

  if (occupied + guest.groupSize > cab.capacity) {
    throw new AppError('Cab capacity exceeded', 409, 'CAB_CAPACITY_EXCEEDED');
  }

  return cabRepository.assignGuest({
    eventId: cab.eventId,
    cabId,
    guestId
  });
};

module.exports = {
  createCab,
  assignGuest
};
