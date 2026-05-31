const prisma = require('../config/db');

const DEFAULTS = {
  voiceAiEnabled: true,
  ivrEnabled: true,
  qrEnabled: true,
  outreachEnabled: false,
  outreachAutoStart: false,
  outreachVoiceDelayHours: 24,
  outreachAutoCallMode: 'ai',
  outreachReminderEnabled: true
};

const findByEventId = (eventId) => prisma.eventSetting.findUnique({
  where: { eventId }
});

const upsertByEventId = (eventId, data = {}) => prisma.eventSetting.upsert({
  where: { eventId },
  create: {
    eventId,
    ...DEFAULTS,
    ...data
  },
  update: data
});

const ensureForEvent = async (eventId) => upsertByEventId(eventId, {});

module.exports = {
  DEFAULTS,
  findByEventId,
  upsertByEventId,
  ensureForEvent
};
