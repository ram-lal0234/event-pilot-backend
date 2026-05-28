const guestRepository = require('../repositories/guest.repository');
const checkinRepository = require('../repositories/checkin.repository');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');

const scan = async ({ qrCode, method, locationType }, user) => {
  const guest = await guestRepository.findByQrCode(qrCode);

  if (!guest) {
    throw new AppError('Invalid QR code', 404, 'INVALID_QR');
  }

  const existing = await checkinRepository.findByGuestId(guest.id);
  const alreadyCheckedIn = Boolean(existing);
  const checkin = existing || await checkinRepository.create({
    eventId: guest.eventId,
    guestId: guest.id,
    method,
    locationType
  });

  if (!alreadyCheckedIn) {
    await auditService.enqueueAuditLog({
      eventId: guest.eventId,
      userId: user && user.id,
      action: 'GUEST_CHECKED_IN',
      entityType: 'Guest',
      entityId: guest.id,
      metadata: {
        method,
        locationType,
        checkinId: checkin.id
      }
    });
  }

  return {
    guest,
    checkin,
    alreadyCheckedIn
  };
};

const undo = async ({ qrCode }, user) => {
  const guest = await guestRepository.findByQrCode(qrCode);
  if (!guest) {
    throw new AppError('Invalid QR code', 404, 'INVALID_QR');
  }

  const existing = await checkinRepository.findByGuestId(guest.id);
  if (!existing) {
    throw new AppError('Guest is not checked in', 409, 'CHECKIN_NOT_FOUND');
  }

  await checkinRepository.deleteByGuestId(guest.id);
  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user && user.id,
    action: 'GUEST_CHECKIN_UNDONE',
    entityType: 'Guest',
    entityId: guest.id,
    metadata: {
      checkinId: existing.id
    }
  });

  return { guestId: guest.id };
};

module.exports = {
  scan,
  undo
};
