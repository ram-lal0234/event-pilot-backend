const { randomUUID, randomBytes } = require('crypto');
const { parse } = require('csv-parse/sync');
const QRCode = require('qrcode');
const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const eventRepository = require('../repositories/event.repository');
const guestInviteRepository = require('../repositories/guest-invite.repository');
const auditService = require('./audit.service');
const voiceCallService = require('./voice-call.service');
const AppError = require('../utils/AppError');
const { normalizePhoneE164, inferDefaultCountryCode } = require('../utils/phone.util');
const { buildPublicRsvpUrl } = require('../utils/public-rsvp.util');
const env = require('../config/env');

const normalizeGuestPhone = (phone) => {
  try {
    return normalizePhoneE164(phone, {
      defaultCountryCode: inferDefaultCountryCode(env.plivo?.fromNumber)
    });
  } catch (error) {
    throw new AppError(error.message, 400, 'INVALID_PHONE');
  }
};

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

const toIsoString = (value) => (value ? new Date(value).toISOString() : null);

const parseResponseInput = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
};

const getEventObject = (payload = {}) => payload?.data?.object || payload?.data?.Object || {};
const getEventData = (payload = {}) => {
  const object = getEventObject(payload);
  return object.event_data || object.eventData || {};
};

const buildIvrLogEntry = (log) => {
  const parsed = parseResponseInput(log.responseInput);
  const kind = parsed?.kind || (parsed?.raw ? 'ivr_response' : 'ivr_log');
  const isTranscript = kind === 'ai/transcript';

  return {
    id: `ivr-log:${log.id}`,
    source: 'ivr_log',
    type: isTranscript ? 'transcript' : kind,
    at: toIsoString(log.createdAt),
    status: log.callStatus,
    callUuid: parsed?.callUuid || null,
    callId: parsed?.callId || null,
    eventName: parsed?.eventName || null,
    outcome: parsed?.callOutcome || null,
    rsvpStatus: parsed?.rsvpStatus || null,
    groupSize: parsed?.groupSize ?? null,
    needsCab: parsed?.needsCab ?? null,
    needsHotel: parsed?.needsHotel ?? null,
    pickupLocation: parsed?.pickupLocation || null,
    guestNotes: parsed?.guestNotes || null,
    language: parsed?.language || null,
    transcription: parsed?.transcription || null,
    recordingUrl: parsed?.recordingUrl || null,
    attempt: log.attempt,
    callDuration: log.callDuration,
    rsvpCaptured: log.rsvpCaptured,
    groupSizeCaptured: log.groupSizeCaptured
  };
};

const buildCallEventEntry = (event) => {
  const payload = event.payload || {};
  const object = getEventObject(payload);
  const eventData = getEventData(payload);
  const eventName = object.event_name || object.eventName || event.type;
  const type = String(event.type || '').startsWith('ai:recording')
    || eventData.transcription
    || object.transcription
    ? 'transcript'
    : String(event.type || '').includes('error')
      ? 'error'
      : 'lifecycle';

  return {
    id: `call-event:${event.id}`,
    source: 'call_event',
    type,
    at: toIsoString(event.createdAt),
    status: object.status || object.call_status || object.callStatus || null,
    callUuid: event.callUuid,
    callId: event.callId || null,
    eventName,
    outcome: null,
    rsvpStatus: null,
    groupSize: null,
    needsCab: null,
    needsHotel: null,
    pickupLocation: null,
    guestNotes: null,
    language: null,
    transcription: eventData.transcription || object.transcription || null,
    recordingUrl: eventData.recording_url || eventData.recordingUrl || object.recording_url || null,
    provider: event.provider
  };
};

const buildCallStatusEntry = (call) => ({
  id: `call:${call.id}`,
  source: 'call',
  type: 'call_status',
  at: toIsoString(call.createdAt),
  status: call.status,
  callUuid: call.callUuid,
  callId: call.id,
  eventName: 'call_created',
  outcome: null,
  rsvpStatus: null,
  groupSize: null,
  needsCab: null,
  needsHotel: null,
  pickupLocation: null,
  guestNotes: null,
  language: null,
  transcription: null,
  recordingUrl: null,
  provider: call.provider,
  lastEventAt: toIsoString(call.lastEventAt),
  updatedAt: toIsoString(call.updatedAt)
});

const buildCallLogTimeline = (guest) => {
  const callEntries = guest.calls.flatMap((call) => [
    buildCallStatusEntry(call),
    ...call.events.map(buildCallEventEntry)
  ]);
  const ivrEntries = guest.ivrLogs.map(buildIvrLogEntry);

  return [...callEntries, ...ivrEntries]
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
};

const isUniqueConstraintError = (error, fields) => {
  const target = error?.meta?.target || [];

  return error?.code === 'P2002'
    && Array.isArray(target)
    && fields.every((field) => target.includes(field));
};

const enrichGuest = (guest) => {
  if (!guest) {
    return guest;
  }

  const inviteCode = guest.invites?.[0]?.code || guest.inviteCode || null;

  return {
    ...guest,
    invites: undefined,
    inviteCode,
    publicRsvpUrl: inviteCode ? buildPublicRsvpUrl(inviteCode) : null
  };
};

const ensureGuestInvite = async (guestId) => {
  const existing = await guestInviteRepository.findByGuestId(guestId);

  if (existing) {
    return existing;
  }

  return guestInviteRepository.create({
    guestId,
    code: randomBytes(16).toString('hex')
  });
};

const enrichGuestForList = async (guest) => {
  if (guest.invites?.[0]?.code) {
    return enrichGuest(guest);
  }

  const invite = await ensureGuestInvite(guest.id);
  return enrichGuest({ ...guest, invites: [{ code: invite.code }] });
};

const getGuestRsvpLink = async (id, user) => {
  const guest = await guestRepository.findById(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);

  const invite = await ensureGuestInvite(guest.id);

  return {
    inviteCode: invite.code,
    publicRsvpUrl: buildPublicRsvpUrl(invite.code)
  };
};

const createGuestRecord = async (payload, { tx } = {}) => {
  const db = tx || prisma;
  const qrCode = `guest:${payload.eventId}:${randomUUID()}`;
  const qrImage = await QRCode.toDataURL(qrCode);

  const guest = await db.guest.create({
    data: {
      eventId: payload.eventId,
      name: payload.name,
      phone: normalizeGuestPhone(payload.phone),
      email: payload.email || null,
      pickupLocation: payload.pickupLocation || null,
      pickupLat: payload.pickupLat,
      pickupLng: payload.pickupLng,
      category: payload.category,
      groupSize: payload.groupSize,
      qrCode,
      needsCab: payload.needsCab ?? null,
      needsHotel: payload.needsHotel ?? null,
      guestNotes: payload.guestNotes || null,
      language: payload.language || null
    }
  });

  const invite = await db.guestInvite.create({
    data: {
      guestId: guest.id,
      code: randomBytes(16).toString('hex')
    }
  });

  return {
    guest,
    qrImage,
    invite
  };
};

const createGuest = async (payload, user) => {
  await assertEventAccess(payload.eventId, user);

  let guest;
  let qrImage;
  let invite;

  try {
    ({ guest, qrImage, invite } = await createGuestRecord(payload));
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

  return enrichGuest({
    ...guest,
    qrImage,
    inviteCode: invite.code,
    publicRsvpUrl: buildPublicRsvpUrl(invite.code)
  });
};

const listGuests = async (query, user) => {
  await assertEventAccess(query.eventId, user);

  if (query.page || query.pageSize) {
    const result = await guestRepository.findManyPaginated({
      ...query,
      page: query.page || 1,
      pageSize: query.pageSize || 10
    });

    return {
      ...result,
      items: await Promise.all(result.items.map(enrichGuestForList))
    };
  }

  const items = await guestRepository.findMany(query);
  return Promise.all(items.map(enrichGuestForList));
};

const updateGuest = async (id, payload, user) => {
  const guest = await guestRepository.findById(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);

  const updatePayload = { ...payload };

  if (updatePayload.phone !== undefined) {
    updatePayload.phone = normalizeGuestPhone(updatePayload.phone);
  }

  const updatedGuest = await guestRepository.update(id, updatePayload);
  const changes = pickChangedFields(guest, updatedGuest, [
    'name',
    'phone',
    'email',
    'pickupLocation',
    'pickupLat',
    'pickupLng',
    'category',
    'groupSize',
    'followUpStatus',
    'callbackAt',
    'lastContactedAt',
    'assignedTo',
    'needsCab',
    'needsHotel',
    'guestNotes',
    'language'
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

  const invite = await ensureGuestInvite(id);
  return enrichGuest({ ...updatedGuest, invites: [{ code: invite.code }] });
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
    ivrRespondedAt: new Date(),
    lastContactedAt: new Date(),
    followUpStatus: payload.rsvpStatus === 'PENDING' ? 'NEEDS_FOLLOW_UP' : 'COMPLETED'
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

const getGuestCallLogs = async (id, user) => {
  const guest = await guestRepository.findCallLogData(id);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);

  const timeline = buildCallLogTimeline(guest);
  const latestCall = guest.calls[0] || null;

  return {
    guest: {
      id: guest.id,
      name: guest.name,
      phone: guest.phone,
      rsvpStatus: guest.rsvpStatus
    },
    summary: {
      totalCalls: guest.calls.length,
      totalEvents: guest.calls.reduce((count, call) => count + call.events.length, 0),
      totalIvrLogs: guest.ivrLogs.length,
      latestStatus: latestCall?.status || null,
      lastVoiceResponseAt: toIsoString(guest.ivrRespondedAt),
      hasTranscript: timeline.some((entry) => Boolean(entry.transcription || entry.recordingUrl))
    },
    timeline
  };
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

const triggerIvr = async (guestId, user, callMode) => voiceCallService.triggerOutboundCall(guestId, user, { callMode });

const uploadCsv = async ({ eventId, csv }, user) => {
  await assertEventAccess(eventId, user);

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const prepared = [];
  const validationErrors = [];

  records.forEach((record, index) => {
    try {
      prepared.push({
        eventId,
        name: record.name,
        phone: record.phone,
        email: record.email || null,
        pickupLocation: record.pickup_location || record.pickupLocation || null,
        pickupLat: toOptionalNumber(record.pickup_lat || record.pickupLat),
        pickupLng: toOptionalNumber(record.pickup_lng || record.pickupLng),
        category: record.category || 'GENERAL',
        groupSize: Number(record.group_size || record.groupSize || 1)
      });
    } catch (error) {
      validationErrors.push({
        row: index + 2,
        message: error.message || 'Invalid row'
      });
    }
  });

  if (validationErrors.length) {
    const message = `CSV validation failed: ${validationErrors.map((item) => `row ${item.row} ${item.message}`).join('; ')}`;
    throw new AppError(message, 400, 'CSV_VALIDATION_FAILED');
  }

  let guests = [];

  try {
    guests = await prisma.$transaction(async (tx) => {
      const created = [];

      for (const row of prepared) {
        const { guest, qrImage, invite } = await createGuestRecord(row, { tx });
        created.push(enrichGuest({
          ...guest,
          qrImage,
          inviteCode: invite.code,
          publicRsvpUrl: buildPublicRsvpUrl(invite.code)
        }));
      }

      return created;
    });
  } catch (error) {
    if (isUniqueConstraintError(error, ['event_id', 'phone']) || isUniqueConstraintError(error, ['eventId', 'phone'])) {
      throw new AppError('CSV import failed: duplicate phone number in this event.', 409, 'GUEST_PHONE_EXISTS');
    }

    throw error;
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
  getGuestRsvpLink,
  getGuestCallLogs,
  deleteGuest,
  triggerIvr,
  uploadCsv
};
