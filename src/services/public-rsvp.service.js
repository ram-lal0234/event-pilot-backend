const guestInviteRepository = require('../repositories/guest-invite.repository');
const guestRepository = require('../repositories/guest.repository');
const AppError = require('../utils/AppError');

const sanitizeInvite = (record) => ({
  code: record.code,
  expiresAt: record.expiresAt,
  guest: {
    id: record.guest.id,
    name: record.guest.name,
    phone: record.guest.phone,
    email: record.guest.email,
    rsvpStatus: record.guest.rsvpStatus,
    groupSize: record.guest.groupSize,
    pickupLocation: record.guest.pickupLocation
  },
  event: record.guest.event
});

const getByCode = async ({ code }) => {
  const invite = await guestInviteRepository.findValidByCode(code);
  if (!invite) {
    throw new AppError('Invite not found or expired', 404, 'INVITE_NOT_FOUND');
  }

  return sanitizeInvite(invite);
};

const submit = async ({ code, payload }) => {
  const invite = await guestInviteRepository.findValidByCode(code);
  if (!invite) {
    throw new AppError('Invite not found or expired', 404, 'INVITE_NOT_FOUND');
  }

  const guest = await guestRepository.update(invite.guest.id, {
    rsvpStatus: payload.rsvpStatus,
    groupSize: payload.groupSize,
    pickupLocation: payload.pickupLocation || null,
    callbackAt: payload.callbackAt ? new Date(payload.callbackAt) : null,
    followUpStatus: payload.followUpStatus || (payload.rsvpStatus === 'PENDING' ? 'NEEDS_FOLLOW_UP' : 'COMPLETED'),
    ivrRespondedAt: new Date(),
    lastContactedAt: new Date()
  });

  await guestInviteRepository.markUsed(invite.id);

  return {
    guest: {
      id: guest.id,
      name: guest.name,
      rsvpStatus: guest.rsvpStatus,
      groupSize: guest.groupSize,
      pickupLocation: guest.pickupLocation
    }
  };
};

module.exports = {
  getByCode,
  submit
};
