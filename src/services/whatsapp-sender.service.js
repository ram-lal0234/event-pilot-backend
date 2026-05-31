/**
 * @deprecated Prefer notification.producer + notification-delivery for async sends.
 * Kept for phone formatting helpers used when building queue payloads.
 */
const notificationDelivery = require('../notifications/notification-delivery.service');

module.exports = {
  phoneToWhatsAppRecipient: notificationDelivery.phoneToWhatsAppRecipient,
  resolveSenderUrl: notificationDelivery.resolveWhatsAppUrl,
  sendWhatsAppMessage: notificationDelivery.sendWhatsApp
};
