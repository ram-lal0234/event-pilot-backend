const guestRepository = require('../repositories/guest.repository');
const checkinRepository = require('../repositories/checkin.repository');
const accessService = require('./access.service');
const auditService = require('./audit.service');
const { publishGuestEventAsync } = require('./realtime-events');
const AppError = require('../utils/AppError');

const scan = async ({ qrCode, method, locationType }, user) => {
  const guest = await guestRepository.findByQrCode(qrCode);

  if (!guest) {
    throw new AppError('Invalid QR code', 404, 'INVALID_QR');
  }

  await accessService.assertEventAccess(user.id, guest.eventId, { level: 'FULL' });

  const existing = await checkinRepository.findByGuestAndLocation(guest.id, locationType);
  const alreadyCheckedIn = Boolean(existing);
  const checkin = existing || await checkinRepository.create({
    eventId: guest.eventId,
    guestId: guest.id,
    method,
    locationType
  });

  if (!alreadyCheckedIn) {
    publishGuestEventAsync(guest.eventId, 'checkin', guest, { locationType, method });

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

  const allCheckins = await checkinRepository.findByGuestId(guest.id);

  return {
    guest,
    checkin,
    checkins: allCheckins,
    alreadyCheckedIn,
    locationType
  };
};

const undo = async ({ qrCode, locationType }, user) => {
  const guest = await guestRepository.findByQrCode(qrCode);
  if (!guest) {
    throw new AppError('Invalid QR code', 404, 'INVALID_QR');
  }

  await accessService.assertEventAccess(user.id, guest.eventId, { level: 'FULL' });

  if (locationType) {
    const existing = await checkinRepository.findByGuestAndLocation(guest.id, locationType);
    if (!existing) {
      throw new AppError(`Guest is not checked in at ${locationType}`, 409, 'CHECKIN_NOT_FOUND');
    }

    await checkinRepository.deleteByGuestAndLocation(guest.id, locationType);
    await auditService.enqueueAuditLog({
      eventId: guest.eventId,
      userId: user && user.id,
      action: 'GUEST_CHECKIN_UNDONE',
      entityType: 'Guest',
      entityId: guest.id,
      metadata: {
        checkinId: existing.id,
        locationType
      }
    });

    return { guestId: guest.id, locationType };
  }

  const existing = await checkinRepository.findByGuestId(guest.id);
  if (!existing.length) {
    throw new AppError('Guest is not checked in', 409, 'CHECKIN_NOT_FOUND');
  }

  await checkinRepository.deleteAllByGuestId(guest.id);
  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user && user.id,
    action: 'GUEST_CHECKIN_UNDONE',
    entityType: 'Guest',
    entityId: guest.id,
    metadata: {
      removedCount: existing.length
    }
  });

  return { guestId: guest.id };
};

module.exports = {
  scan,
  undo
};
