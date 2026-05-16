const { randomUUID } = require('crypto');
const { parse } = require('csv-parse/sync');
const QRCode = require('qrcode');
const guestRepository = require('../repositories/guest.repository');
const eventRepository = require('../repositories/event.repository');
const auditService = require('./audit.service');
const queueService = require('../queue/queue.service');
const AppError = require('../utils/AppError');

const assertEventAccess = async (eventId, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }
};

const createGuest = async (payload, user) => {
  await assertEventAccess(payload.eventId, user);

  const qrCode = `guest:${payload.eventId}:${randomUUID()}`;
  const qrImage = await QRCode.toDataURL(qrCode);

  const guest = await guestRepository.create({
    eventId: payload.eventId,
    name: payload.name,
    phone: payload.phone,
    email: payload.email || null,
    category: payload.category,
    groupSize: payload.groupSize,
    qrCode
  });

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    action: 'GUEST_CREATED',
    entityType: 'Guest',
    entityId: guest.id,
    metadata: {
      createdBy: user.id,
      category: guest.category,
      groupSize: guest.groupSize
    }
  });

  return {
    ...guest,
    qrImage
  };
};

const listGuests = async (query, user) => {
  await assertEventAccess(query.eventId, user);
  return guestRepository.findMany(query);
};

const updateGuest = async (id, payload, user) => {
  const guest = await guestRepository.findById(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);
  return guestRepository.update(id, payload);
};

const deleteGuest = async (id, user) => {
  const guest = await guestRepository.findById(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);
  await guestRepository.remove(id);

  return { id };
};

const triggerIvr = async (guestId, user) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);

  await queueService.addJob('ivr', {
    guestId: guest.id,
    eventId: guest.eventId,
    phone: guest.phone
  });

  return { queued: true };
};

const uploadCsv = async ({ eventId, csv }, user) => {
  await assertEventAccess(eventId, user);

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const guests = [];

  for (const record of records) {
    guests.push(await createGuest({
      eventId,
      name: record.name,
      phone: record.phone,
      email: record.email || null,
      category: record.category || 'GENERAL',
      groupSize: Number(record.group_size || record.groupSize || 1)
    }, user));
  }

  return {
    inserted: guests.length,
    guests
  };
};

module.exports = {
  createGuest,
  listGuests,
  updateGuest,
  deleteGuest,
  triggerIvr,
  uploadCsv
};
