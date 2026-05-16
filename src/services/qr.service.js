const guestRepository = require('../repositories/guest.repository');
const checkinRepository = require('../repositories/checkin.repository');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');

const scan = async ({ qrCode, method }) => {
  const guest = await guestRepository.findByQrCode(qrCode);

  if (!guest) {
    throw new AppError('Invalid QR code', 404, 'INVALID_QR');
  }

  const checkin = await checkinRepository.create({
    eventId: guest.eventId,
    guestId: guest.id,
    method
  });

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    action: 'GUEST_CHECKED_IN',
    entityType: 'Guest',
    entityId: guest.id,
    metadata: {
      method,
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
