const guestRepository = require('../repositories/guest.repository');
const checkinRepository = require('../repositories/checkin.repository');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');

const scan = async ({ qrCode, method, locationType }, user) => {
  const guest = await guestRepository.findByQrCode(qrCode);

  if (!guest) {
    throw new AppError('Invalid QR code', 404, 'INVALID_QR');
  }

  const checkin = await checkinRepository.create({
    eventId: guest.eventId,
    guestId: guest.id,
    method,
    locationType
  });

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

  return {
    guest,
    checkin
  };
};

module.exports = {
  scan
};
