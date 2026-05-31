const guestRepository = require('../repositories/guest.repository');
const accessService = require('./access.service');
const notificationDelivery = require('../notifications/notification-delivery.service');
const AppError = require('../utils/AppError');

const sendGuestWhatsApp = async (guestId, user, { message, mediaBase64, mediaFilename }) => {
  const guest = await guestRepository.findByIdWithEvent(guestId);
  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await accessService.assertEventAccess(user.id, guest.eventId, { level: 'FULL' });

  const recipient = notificationDelivery.phoneToWhatsAppRecipient(guest.phone);
  if (!recipient) {
    throw new AppError('Guest phone number is not valid for WhatsApp', 400, 'INVALID_PHONE');
  }

  const result = await notificationDelivery.sendWhatsApp({
    recipient,
    message: message || '',
    ...(mediaBase64 ? {
      media_base64: mediaBase64,
      ...(mediaFilename ? { media_filename: mediaFilename } : {})
    } : {})
  });

  if (!result.success) {
    const error = new AppError(result.message || 'WhatsApp send failed', 502, result.code || 'WHATSAPP_SEND_FAILED');
    error.timedOut = result.timedOut;
    throw error;
  }

  return {
    success: true,
    message: result.message || 'Message sent',
    guestId
  };
};

module.exports = {
  sendGuestWhatsApp
};
