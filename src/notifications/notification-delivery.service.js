const env = require('../config/env');
const logger = require('../utils/logger');
const { digitsOnly, normalizePhoneE164, inferDefaultCountryCode } = require('../utils/phone.util');

const resendEndpoint = 'https://api.resend.com/emails';

const resolveWhatsAppUrl = () => (
  env.whatsappSenderUrl
  || process.env.WHATSAPP_SENDER_URL
  || 'http://localhost:8080/api/send'
).replace(/\/$/, '');

const phoneToWhatsAppRecipient = (phone) => {
  const e164 = normalizePhoneE164(phone, {
    defaultCountryCode: inferDefaultCountryCode(env.plivo?.fromNumber)
  });
  return digitsOnly(e164);
};

/**
 * Sends via whatsapp-mcp bridge. Hard timeout protects the linked WhatsApp number
 * from hanging requests (default 5s).
 */
const sendWhatsApp = async ({
  recipient,
  message,
  media_path: mediaPath,
  media_base64: mediaBase64,
  media_filename: mediaFilename
}) => {
  const url = resolveWhatsAppUrl();
  const timeoutMs = env.whatsappSendTimeoutMs;

  if (!recipient) {
    return { success: false, message: 'Missing WhatsApp recipient', code: 'INVALID_RECIPIENT' };
  }

  if (!message?.trim() && !mediaPath && !mediaBase64) {
    return { success: false, message: 'Message or media is required', code: 'INVALID_PAYLOAD' };
  }

  const body = {
    recipient,
    message: message || '',
    ...(mediaPath ? { media_path: mediaPath } : {}),
    ...(mediaBase64 ? {
      media_base64: mediaBase64,
      ...(mediaFilename ? { media_filename: mediaFilename } : {})
    } : {})
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const errorMessage = payload.message || `WhatsApp bridge HTTP ${response.status}`;
      return { success: false, message: errorMessage, code: 'WHATSAPP_BRIDGE_ERROR' };
    }

    return {
      success: true,
      message: payload.message || 'Message sent',
      timedOut: false
    };
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';

    if (isTimeout) {
      logger.warn('WhatsApp send timed out', { recipient, timeoutMs });
      return {
        success: false,
        message: `WhatsApp send timed out after ${timeoutMs}ms`,
        code: 'WHATSAPP_SEND_TIMEOUT',
        timedOut: true
      };
    }

    logger.error(error, { recipient, context: 'whatsapp-delivery' });
    return {
      success: false,
      message: error.message || 'WhatsApp sender unreachable',
      code: 'WHATSAPP_SEND_FAILED'
    };
  }
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (env.emailProvider === 'mock') {
    logger.info('Mock email send', { to, subject });
    return { success: true, message: 'Mock email logged' };
  }

  if (!env.resendApiKey || !env.emailFrom) {
    return { success: false, message: 'Email not configured', code: 'EMAIL_NOT_CONFIGURED' };
  }

  try {
    const response = await fetch(resendEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to,
        subject,
        html,
        text
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        success: false,
        message: `Resend failed (${response.status}): ${body}`,
        code: 'EMAIL_SEND_FAILED'
      };
    }

    return { success: true, message: 'Email sent' };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Email send failed',
      code: 'EMAIL_SEND_FAILED'
    };
  }
};

module.exports = {
  phoneToWhatsAppRecipient,
  resolveWhatsAppUrl,
  sendWhatsApp,
  sendEmail
};
