const prisma = require('../config/db');
const eventRepository = require('../repositories/event.repository');
const eventSettingRepository = require('../repositories/event-setting.repository');
const auditService = require('./audit.service');
const accessService = require('./access.service');
const AppError = require('../utils/AppError');

const formatEventSetting = (setting) => ({
  voiceAiEnabled: setting?.voiceAiEnabled ?? true,
  ivrEnabled: setting?.ivrEnabled ?? true,
  qrEnabled: setting?.qrEnabled ?? true,
  outreachEnabled: setting?.outreachEnabled ?? false,
  outreachAutoStart: setting?.outreachAutoStart ?? false,
  outreachVoiceDelayHours: setting?.outreachVoiceDelayHours ?? 24,
  outreachAutoCallMode: setting?.outreachAutoCallMode === 'ivr' ? 'ivr' : 'ai',
  outreachReminderEnabled: setting?.outreachReminderEnabled !== false,
  outreachMessageTemplate: setting?.outreachMessageTemplate || null,
  outreachReminderTemplate: setting?.outreachReminderTemplate || null
});

const attachSetting = (event) => ({
  ...event,
  setting: formatEventSetting(event.setting)
});

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

  await eventSettingRepository.ensureForEvent(event.id);

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

const getEvent = async (eventId, user) => {
  await accessService.assertEventAccess(user.id, eventId, { level: 'READ' });

  const event = await eventRepository.findByIdWithSetting(eventId);

  if (!event || event.deletedAt) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  if (!event.setting) {
    event.setting = await eventSettingRepository.ensureForEvent(eventId);
  }

  const [withStats] = await attachEventStats([event]);
  return attachSetting(withStats);
};

const updateEvent = async (eventId, payload, user) => {
  await accessService.assertEventAccess(user.id, eventId, { level: 'FULL' });

  const event = await eventRepository.findById(eventId);

  if (!event || event.deletedAt) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  const eventPatch = {};
  if (payload.name !== undefined) eventPatch.name = payload.name;
  if (payload.date !== undefined) eventPatch.date = new Date(payload.date);
  if (payload.location !== undefined) eventPatch.location = payload.location;

  if (Object.keys(eventPatch).length) {
    await eventRepository.update(eventId, eventPatch);
  }

  const settingPatch = {};
  if (payload.voiceAiEnabled !== undefined) settingPatch.voiceAiEnabled = payload.voiceAiEnabled;
  if (payload.ivrEnabled !== undefined) settingPatch.ivrEnabled = payload.ivrEnabled;
  if (payload.qrEnabled !== undefined) settingPatch.qrEnabled = payload.qrEnabled;
  if (payload.outreachEnabled !== undefined) settingPatch.outreachEnabled = payload.outreachEnabled;
  if (payload.outreachAutoStart !== undefined) settingPatch.outreachAutoStart = payload.outreachAutoStart;
  if (payload.outreachVoiceDelayHours !== undefined) {
    settingPatch.outreachVoiceDelayHours = Math.min(Math.max(Number(payload.outreachVoiceDelayHours), 1), 48);
  }
  if (payload.outreachAutoCallMode !== undefined) settingPatch.outreachAutoCallMode = payload.outreachAutoCallMode;
  if (payload.outreachReminderEnabled !== undefined) {
    settingPatch.outreachReminderEnabled = payload.outreachReminderEnabled;
  }
  if (payload.outreachMessageTemplate !== undefined) {
    settingPatch.outreachMessageTemplate = payload.outreachMessageTemplate || null;
  }
  if (payload.outreachReminderTemplate !== undefined) {
    settingPatch.outreachReminderTemplate = payload.outreachReminderTemplate || null;
  }

  if (Object.keys(settingPatch).length) {
    await eventSettingRepository.upsertByEventId(eventId, settingPatch);
  }

  await auditService.enqueueAuditLog({
    eventId,
    userId: user.id,
    action: 'EVENT_UPDATED',
    entityType: 'Event',
    entityId: eventId,
    metadata: {
      ...eventPatch,
      ...settingPatch
    }
  });

  return getEvent(eventId, user);
};

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent
};
