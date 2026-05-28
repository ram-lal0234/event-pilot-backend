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
    driverPhone: payload.driverPhone || null,
    vehicleNumber: payload.vehicleNumber,
    capacity: payload.capacity,
    pickupTime: payload.pickupTime ? new Date(payload.pickupTime) : null,
    routeZone: payload.routeZone || null,
    tripStatus: payload.tripStatus || null
  });

  await auditService.enqueueAuditLog({
    eventId: cab.eventId,
    userId: user.id,
    action: 'CAB_CREATED',
    entityType: 'Cab',
    entityId: cab.id,
    metadata: {
      driverName: cab.driverName,
      driverPhone: cab.driverPhone,
      vehicleNumber: cab.vehicleNumber,
      capacity: cab.capacity,
      pickupTime: cab.pickupTime,
      routeZone: cab.routeZone,
      tripStatus: cab.tripStatus,
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

const unassignGuest = async ({ guestId }, user) => {
  const assignment = await cabRepository.findAssignmentByGuestId(guestId);
  if (!assignment) {
    throw new AppError('Cab assignment not found', 404, 'CAB_ASSIGNMENT_NOT_FOUND');
  }

  const hasAccess = await eventRepository.userCanAccessEvent(assignment.cab.eventId, user);
  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  const guest = await guestRepository.findById(guestId);
  await cabRepository.unassignGuestWithSeatRelease({
    assignmentId: assignment.id,
    cabId: assignment.cabId,
    seats: guest?.groupSize || 1
  });

  return { id: assignment.id };
};

const moveGuest = async ({ guestId, toCabId }, user) => {
  const existing = await cabRepository.findAssignmentByGuestId(guestId);
  if (!existing) {
    throw new AppError('Cab assignment not found', 404, 'CAB_ASSIGNMENT_NOT_FOUND');
  }

  await unassignGuest({ guestId }, user);
  return assignGuest({ cabId: toCabId, guestId }, user);
};

module.exports = {
  createCab,
  listCabs,
  assignGuest,
  unassignGuest,
  moveGuest
};
