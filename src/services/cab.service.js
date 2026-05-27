const cabRepository = require('../repositories/cab.repository');
const guestRepository = require('../repositories/guest.repository');
const eventRepository = require('../repositories/event.repository');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');

const createCab = async (payload, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(payload.eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  const cab = await cabRepository.create({
    eventId: payload.eventId,
    driverName: payload.driverName,
    vehicleNumber: payload.vehicleNumber,
    capacity: payload.capacity
  });

  await auditService.enqueueAuditLog({
    eventId: cab.eventId,
    userId: user.id,
    action: 'CAB_CREATED',
    entityType: 'Cab',
    entityId: cab.id,
    metadata: {
      driverName: cab.driverName,
      vehicleNumber: cab.vehicleNumber,
      capacity: cab.capacity,
      createdBy: user.id
    }
  });

  return cab;
};

const listCabs = async ({ eventId }, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  return cabRepository.findManyByEvent(eventId);
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

  if (guest.rsvpStatus !== 'CONFIRMED') {
    throw new AppError('Only confirmed guests can be assigned to a cab', 409, 'CAB_ASSIGNMENT_REQUIRES_CONFIRMED_RSVP');
  }

  if (cab.usedSeats + guest.groupSize > cab.capacity) {
    throw new AppError('Cab capacity exceeded', 409, 'CAB_CAPACITY_EXCEEDED');
  }

  const assignment = await cabRepository.assignGuestWithSeatReservation({
    eventId: cab.eventId,
    cabId,
    guestId,
    seats: guest.groupSize
  });

  if (!assignment) {
    throw new AppError('Cab capacity exceeded', 409, 'CAB_CAPACITY_EXCEEDED');
  }

  await auditService.enqueueAuditLog({
    eventId: cab.eventId,
    userId: user.id,
    action: 'GUEST_ASSIGNED_TO_CAB',
    entityType: 'CabAssignment',
    entityId: assignment.id,
    metadata: {
      cabId,
      guestId,
      seats: guest.groupSize,
      assignedBy: user.id
    }
  });

  return assignment;
};

module.exports = {
  createCab,
  listCabs,
  assignGuest
};
