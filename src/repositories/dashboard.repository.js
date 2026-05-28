const prisma = require('../config/db');
const env = require('../config/env');
const auditRepository = require('./audit.repository');

const summary = async (eventId) => {
  const [totalGuests, confirmed, declined, pendingRsvp, checkedIn, pendingPickups, followUps, needsFollowUpGuests] = await Promise.all([
    prisma.guest.count({ where: { eventId } }),
    prisma.guest.count({ where: { eventId, rsvpStatus: 'CONFIRMED' } }),
    prisma.guest.count({ where: { eventId, rsvpStatus: 'DECLINED' } }),
    prisma.guest.count({ where: { eventId, rsvpStatus: 'PENDING' } }),
    prisma.checkin.count({ where: { eventId } }),
    prisma.guest.count({
      where: {
        eventId,
        rsvpStatus: 'CONFIRMED',
        cabAssignments: { none: {} }
      }
    }),
    prisma.guest.groupBy({
      by: ['followUpStatus'],
      where: { eventId },
      _count: {
        _all: true
      }
    }),
    prisma.guest.findMany({
      where: {
        eventId,
        followUpStatus: {
          in: ['NEEDS_FOLLOW_UP', 'CALLBACK_LATER', 'NO_ANSWER', 'VOICEMAIL']
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        rsvpStatus: true,
        followUpStatus: true,
        callbackAt: true,
        lastContactedAt: true
      },
      orderBy: [{ callbackAt: 'asc' }, { updatedAt: 'desc' }],
      take: 15
    })
  ]);

  const followUpByStatus = followUps.reduce((acc, item) => {
    acc[item.followUpStatus] = item._count._all;
    return acc;
  }, {});

  const needsFollowUp = (followUpByStatus.NEEDS_FOLLOW_UP || 0)
    + (followUpByStatus.CALLBACK_LATER || 0)
    + (followUpByStatus.NO_ANSWER || 0)
    + (followUpByStatus.VOICEMAIL || 0);

  return {
    totalGuests,
    confirmed,
    declined,
    pendingRsvp,
    checkedIn,
    pendingPickups,
    callbackLater: followUpByStatus.CALLBACK_LATER || 0,
    noAnswer: followUpByStatus.NO_ANSWER || 0,
    voicemail: followUpByStatus.VOICEMAIL || 0,
    needsFollowUp,
    needsFollowUpGuests
  };
};

const liveFeed = (eventId) => auditRepository.findByEvent(eventId, 25);

module.exports = {
  summary,
  liveFeed
};
