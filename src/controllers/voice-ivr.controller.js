const guestRepository = require('../repositories/guest.repository');
const ivrService = require('../services/ivr.service');
const env = require('../config/env');
const logger = require('../utils/logger');

const xmlResponse = (res, body) => {
  res.set('Content-Type', 'application/xml');
  res.status(200).send(body);
};

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const getPublicBaseUrl = (req) => {
  if (env.publicApiUrl) {
    return env.publicApiUrl.replace(/\/$/, '');
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${protocol}://${host}`;
};

const buildDigitActionUrl = (req, guestId, callId) => {
  const url = new URL(`${getPublicBaseUrl(req)}/api/voice/ivr/digit`);
  url.searchParams.set('guestId', guestId);
  if (callId) {
    url.searchParams.set('callId', callId);
  }
  return url.toString();
};

const loadGuestContext = async (guestId) => guestRepository.findByIdWithEvent(guestId);

const answer = async (req, res, next) => {
  try {
    const guestId = req.query.guestId || req.body?.guestId;
    const callId = req.query.callId || req.body?.callId;

    if (!guestId) {
      return xmlResponse(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>We could not identify this call. Goodbye.</Speak>
  <Hangup/>
</Response>`);
    }

    const guest = await loadGuestContext(guestId);
    const eventName = guest?.event?.name || 'your event';
    const digitActionUrl = escapeXml(buildDigitActionUrl(req, guestId, callId));

    return xmlResponse(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>Hello. This is Event Pilot calling about ${escapeXml(eventName)}. Press 1 to confirm you will attend. Press 2 if you cannot attend.</Speak>
  <GetDigits action="${digitActionUrl}" method="POST" timeout="12" numDigits="1" retries="2">
    <Speak>Press 1 to confirm, or 2 to decline.</Speak>
  </GetDigits>
  <Speak>We did not receive a response. Goodbye.</Speak>
  <Hangup/>
</Response>`);
  } catch (error) {
    next(error);
  }
};

const digit = async (req, res, next) => {
  try {
    const guestId = req.query.guestId || req.body?.guestId;
    const digitPressed = req.body?.Digits || req.query?.Digits;

    if (!guestId || !digitPressed) {
      return xmlResponse(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>Invalid response. Goodbye.</Speak>
  <Hangup/>
</Response>`);
    }

    if (!['1', '2'].includes(String(digitPressed))) {
      return xmlResponse(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>Invalid option. Press 1 to confirm or 2 to decline, then hang up and we will call again. Goodbye.</Speak>
  <Hangup/>
</Response>`);
    }

    await ivrService.handleWebhook({
      guestId,
      callStatus: 'COMPLETED',
      attempt: 1,
      responseInput: String(digitPressed)
    });

    const message = digitPressed === '1'
      ? 'Thank you. Your attendance is confirmed. Goodbye.'
      : 'Thank you for letting us know. Goodbye.';

    return xmlResponse(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>${message}</Speak>
  <Hangup/>
</Response>`);
  } catch (error) {
    logger.error(error, { guestId: req.query.guestId, path: req.path });
    return xmlResponse(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>We could not save your response. Please contact the event organizer. Goodbye.</Speak>
  <Hangup/>
</Response>`);
  }
};

module.exports = {
  answer,
  digit
};
