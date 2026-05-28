const prisma = require('../config/db');
const eventRepository = require('../repositories/event.repository');
const auditService = require('./audit.service');
const accessService = require('./access.service');

const attachEventStats = async (events) => {
  if (!events.length) return [];

  const eventIds = events.map((event) => event.id);
  const guestCounts = await prisma.guest.groupBy({
    by: ['eventId'],
    where: { eventId: { in: eventIds }, deletedAt: null },
    _count: { _all: true }
  });
  const confirmedCounts = await prisma.guest.groupBy({
    by: ['eventId'],
    where: {
      eventId: { in: eventIds },
      deletedAt: null,
      rsvpStatus: 'CONFIRMED'
    },
    _count: { _all: true }
  });

  const totalByEvent = new Map(guestCounts.map((row) => [row.eventId, row._count._all]));
  const confirmedByEvent = new Map(confirmedCounts.map((row) => [row.eventId, row._count._all]));

  return events.map((event) => ({
    ...event,
    guestCount: totalByEvent.get(event.id) || 0,
    rsvpConfirmedCount: confirmedByEvent.get(event.id) || 0
  }));
};

const createEvent = async (payload, user) => {
  const member = await accessService.assertCanCreateEvent(user.id);

  const event = await eventRepository.create({
    name: payload.name,
    date: new Date(payload.date),
    location: payload.location,
    createdBy: user.id,
    accountId: member.accountId
  });

  await auditService.enqueueAuditLog({
    eventId: event.id,
    userId: user.id,
    action: 'EVENT_CREATED',
    entityType: 'Event',
    entityId: event.id,
    metadata: {
      name: event.name,
      date: event.date,
      location: event.location,
      accountId: member.accountId
    }
  });

  return { ...event, accessLevel: 'FULL' };
};

const listEvents = async (user) => {
  const events = await accessService.listAccessibleEvents(user.id);
  return attachEventStats(events);
};

module.exports = {
  createEvent,
  listEvents
};
