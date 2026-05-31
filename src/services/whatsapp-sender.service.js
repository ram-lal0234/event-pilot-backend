const env = require('../config/env');
const logger = require('../utils/logger');
const { digitsOnly, normalizePhoneE164, inferDefaultCountryCode } = require('../utils/phone.util');

const phoneToWhatsAppRecipient = (phone) => {
  const e164 = normalizePhoneE164(phone, {
    defaultCountryCode: inferDefaultCountryCode(env.plivo?.fromNumber)
  });
  const digits = digitsOnly(e164);
  if (digits.startsWith('91')) {
    return digits;
  }
  return digits;
};

const resolveSenderUrl = () => (
  env.whatsappSenderUrl
  || process.env.WHATSAPP_SENDER_URL
  || 'http://localhost:8080/api/send'
);

const sendWhatsAppMessage = async ({ recipient, message }) => {
  const url = resolveSenderUrl().replace(/\/$/, '');

  if (!recipient) {
    return { success: false, message: 'Missing WhatsApp recipient' };
  }

  if (!message?.trim()) {
    return { success: false, message: 'Missing WhatsApp message body' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, message })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const errorMessage = payload.message || `WhatsApp sender HTTP ${response.status}`;
      logger.warn('WhatsApp send failed', { recipient, errorMessage });
      return { success: false, message: errorMessage };
    }

    return {
      success: true,
      message: payload.message || 'Message sent'
    };
  } catch (error) {
    logger.error(error, { recipient, context: 'whatsapp-sender' });
    return {
      success: false,
      message: error.message || 'WhatsApp sender unreachable'
    };
  }
};

module.exports = {
  phoneToWhatsAppRecipient,
  sendWhatsAppMessage,
  resolveSenderUrl
};
