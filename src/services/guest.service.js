const { randomUUID } = require('crypto');
const { parse } = require('csv-parse/sync');
const QRCode = require('qrcode');
const guestRepository = require('../repositories/guest.repository');
const eventRepository = require('../repositories/event.repository');
const auditService = require('./audit.service');
const queueService = require('../queue/queue.service');
const callRepository = require('../repositories/call.repository');
const AppError = require('../utils/AppError');

const assertEventAccess = async (eventId, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
};

const pickChangedFields = (before, after, fields) => {
  return fields.reduce((changes, field) => {
    if (Object.prototype.hasOwnProperty.call(after, field) && before[field] !== after[field]) {
      changes[field] = {
        from: before[field] ?? null,
        to: after[field] ?? null
      };
    }

    return changes;
  }, {});
};

const isUniqueConstraintError = (error, fields) => {
  const target = error?.meta?.target || [];

  return error?.code === 'P2002'
    && Array.isArray(target)
    && fields.every((field) => target.includes(field));
};

const createGuest = async (payload, user) => {
  await assertEventAccess(payload.eventId, user);

  const qrCode = `guest:${payload.eventId}:${randomUUID()}`;
  const qrImage = await QRCode.toDataURL(qrCode);

  let guest;

  try {
    guest = await guestRepository.create({
      eventId: payload.eventId,
      name: payload.name,
      phone: payload.phone,
      email: payload.email || null,
      pickupLocation: payload.pickupLocation || null,
      pickupLat: payload.pickupLat,
      pickupLng: payload.pickupLng,
      category: payload.category,
      groupSize: payload.groupSize,
      qrCode
    });
  } catch (error) {
    if (
      isUniqueConstraintError(error, ['event_id', 'phone'])
      || isUniqueConstraintError(error, ['eventId', 'phone'])
    ) {
      throw new AppError('A guest with this phone number already exists for this event.', 409, 'GUEST_PHONE_EXISTS');
    }

    if (isUniqueConstraintError(error, ['qr_code'])) {
      throw new AppError('Could not generate a unique QR code. Please try again.', 409, 'GUEST_QR_CONFLICT');
    }

    throw error;
  }

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user.id,
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

  if (query.page || query.pageSize) {
    return guestRepository.findManyPaginated({
      ...query,
      page: query.page || 1,
      pageSize: query.pageSize || 10
    });
  }

  return guestRepository.findMany(query);
};

const updateGuest = async (id, payload, user) => {
  const guest = await guestRepository.findById(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);
  const updatedGuest = await guestRepository.update(id, payload);
  const changes = pickChangedFields(guest, updatedGuest, [
    'name',
    'phone',
    'email',
    'pickupLocation',
    'pickupLat',
    'pickupLng',
    'category',
    'groupSize'
  ]);

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user.id,
    action: 'GUEST_UPDATED',
    entityType: 'Guest',
    entityId: guest.id,
    metadata: {
      changes,
      updatedBy: user.id
    }
  });

  return updatedGuest;
};

const updateGuestRsvp = async (id, payload, user) => {
  const guest = await guestRepository.findById(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);

  const updatedGuest = await guestRepository.update(id, {
    rsvpStatus: payload.rsvpStatus,
    groupSize: payload.groupSize,
    ivrRespondedAt: new Date()
  });

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user.id,
    action: 'RSVP_MANUALLY_UPDATED',
    entityType: 'Guest',
    entityId: guest.id,
    metadata: {
      previousRsvpStatus: guest.rsvpStatus,
      nextRsvpStatus: payload.rsvpStatus,
      previousGroupSize: guest.groupSize,
      nextGroupSize: payload.groupSize,
      updatedBy: user.id
    }
  });

  return updatedGuest;
};

const deleteGuest = async (id, user) => {
  const guest = await guestRepository.findById(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);
  await guestRepository.remove(id);

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user.id,
    action: 'GUEST_DELETED',
    entityType: 'Guest',
    entityId: guest.id,
    metadata: {
      name: guest.name,
      category: guest.category,
      groupSize: guest.groupSize,
      deletedBy: user.id
    }
  });

  return { id };
};

const triggerIvr = async (guestId, user) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);

  if (guest.rsvpStatus !== 'PENDING') {
    throw new AppError('IVR can only be triggered for guests with pending RSVP.', 409, 'IVR_NOT_ALLOWED_FOR_RSVP_STATUS');
  }

  const call = await callRepository.create({
    eventId: guest.eventId,
    guestId: guest.id,
    phone: guest.phone,
    status: 'QUEUED'
  });

  await queueService.addJob('call', {
    callId: call.id,
    guestId: guest.id,
    eventId: guest.eventId,
    phone: guest.phone
  });

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user.id,
    action: 'IVR_CALL_QUEUED',
    entityType: 'Call',
    entityId: call.id,
    metadata: {
      guestId: guest.id,
      status: call.status,
      queuedBy: user.id
    }
  });

  return { queued: true, callId: call.id };
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
      pickupLocation: record.pickup_location || record.pickupLocation || null,
      pickupLat: toOptionalNumber(record.pickup_lat || record.pickupLat),
      pickupLng: toOptionalNumber(record.pickup_lng || record.pickupLng),
      category: record.category || 'GENERAL',
      groupSize: Number(record.group_size || record.groupSize || 1)
    }, user));
  }

  await auditService.enqueueAuditLog({
    eventId,
    userId: user.id,
    action: 'GUEST_CSV_IMPORTED',
    entityType: 'GuestImport',
    entityId: eventId,
    metadata: {
      inserted: guests.length,
      importedBy: user.id
    }
  });

  return {
    inserted: guests.length,
    guests
  };
};

module.exports = {
  createGuest,
  listGuests,
  updateGuest,
  updateGuestRsvp,
  deleteGuest,
  triggerIvr,
  uploadCsv
};
