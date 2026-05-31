const guestRepository = require('../repositories/guest.repository');
const ivrService = require('./ivr.service');
const env = require('../config/env');

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const getWebhookBaseUrl = () => {
  if (env.publicApiUrl) {
    return env.publicApiUrl.replace(/\/$/, '');
  }

  if (env.plivo.webhookUrl) {
    return env.plivo.webhookUrl.replace(/\/$/, '').replace(/\/webhook\/plivo\/?$/, '');
  }

  return '';
};

const buildDigitActionUrl = (guestId, callId) => {
  const base = getWebhookBaseUrl();

  if (!base) {
    throw new Error('PUBLIC_API_URL is required for IVR digit callbacks');
  }

  const url = new URL(`${base}/webhook/plivo/ivr/digit`);
  url.searchParams.set('guestId', guestId);

  if (callId) {
    url.searchParams.set('callId', callId);
  }

  return url.toString();
};

const loadGuestContext = async (guestId) => guestRepository.findByIdWithEvent(guestId);

const buildAnswerXml = async ({ guestId, callId }) => {
  if (!guestId) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>We could not identify this call. Goodbye.</Speak>
  <Hangup/>
</Response>`;
  }

  const guest = await loadGuestContext(guestId);
  const eventName = guest?.event?.name || 'your event';
  const digitActionUrl = escapeXml(buildDigitActionUrl(guestId, callId));

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>Hello. This is Event Pilot calling about ${escapeXml(eventName)}. Press 1 to confirm you will attend. Press 2 if you cannot attend.</Speak>
  <GetDigits action="${digitActionUrl}" method="POST" timeout="12" numDigits="1" retries="2">
    <Speak>Press 1 to confirm, or 2 to decline.</Speak>
  </GetDigits>
  <Speak>We did not receive a response. Goodbye.</Speak>
  <Hangup/>
</Response>`;
};

const readPlivoCallUuid = (payload = {}) => (
  payload.CallUUID
  || payload.callUuid
  || payload.call_uuid
  || payload.CallUuid
  || null
);

const readPlivoCallDuration = (payload = {}) => {
  const raw = payload.Duration ?? payload.CallDuration ?? payload.callDuration ?? null;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildDigitXml = async ({ guestId, callId, digitPressed, plivoPayload = {} }) => {
  if (!guestId || !digitPressed) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>Invalid response. Goodbye.</Speak>
  <Hangup/>
</Response>`;
  }

  if (!['1', '2'].includes(String(digitPressed))) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>Invalid option. Press 1 to confirm or 2 to decline, then hang up and we will call again. Goodbye.</Speak>
  <Hangup/>
</Response>`;
  }

  await ivrService.handleWebhook({
    guestId,
    callId,
    callUuid: readPlivoCallUuid(plivoPayload),
    callStatus: 'COMPLETED',
    attempt: 1,
    callDuration: readPlivoCallDuration(plivoPayload),
    responseInput: String(digitPressed)
  });

  const message = digitPressed === '1'
    ? 'Thank you. Your attendance is confirmed. Goodbye.'
    : 'Thank you for letting us know. Goodbye.';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>${message}</Speak>
  <Hangup/>
</Response>`;
};

const buildDigitErrorXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>We could not save your response. Please contact the event organizer. Goodbye.</Speak>
  <Hangup/>
</Response>`;

module.exports = {
  buildAnswerXml,
  buildDigitXml,
  buildDigitErrorXml,
  buildDigitActionUrl,
  getWebhookBaseUrl
};
