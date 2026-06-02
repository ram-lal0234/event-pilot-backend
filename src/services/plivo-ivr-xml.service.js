const guestRepository = require('../repositories/guest.repository');
const hotelRepository = require('../repositories/hotel.repository');
const ivrService = require('./ivr.service');
const env = require('../config/env');

const IVR_STEPS = {
  RSVP: 'rsvp',
  GROUP_SIZE: 'group_size',
  PICKUP: 'pickup',
  CAB: 'cab',
  HOTEL: 'hotel'
};

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const getWebhookBaseUrl = () => {
  if (env.publicApiUrl) {
    return env.publicApiUrl.replace(/\/$/, '');
  }

  if (env.plivo.webhookUrl) {
    return env.plivo.webhookUrl.replace(/\/$/, '').replace(/\/webhook\/plivo\/?$/, '');
  }

  return '';
};

const parseSession = (params = {}) => ({
  step: params.step || IVR_STEPS.RSVP,
  rsvp: params.rsvp || null,
  groupSize: params.groupSize ? Number(params.groupSize) : null,
  needsCab: params.needsCab === '1' ? true : params.needsCab === '0' ? false : null,
  needsHotel: params.needsHotel === '1' ? true : params.needsHotel === '0' ? false : null,
  keepPickup: params.keepPickup === '1'
});

const buildDigitActionUrl = (guestId, callId, session = {}) => {
  const base = getWebhookBaseUrl();

  if (!base) {
    throw new Error('PUBLIC_API_URL is required for IVR digit callbacks');
  }

  const url = new URL(`${base}/webhook/plivo/ivr/digit`);
  const entries = {
    ...(callId ? { callId } : {}),
    ...(session.groupSize ? { groupSize: String(session.groupSize) } : {}),
    guestId,
    ...(session.keepPickup ? { keepPickup: '1' } : {}),
    ...(session.needsCab !== null && session.needsCab !== undefined
      ? { needsCab: session.needsCab ? '1' : '0' }
      : {}),
    ...(session.needsHotel !== null && session.needsHotel !== undefined
      ? { needsHotel: session.needsHotel ? '1' : '0' }
      : {}),
    ...(session.rsvp ? { rsvp: session.rsvp } : {}),
    step: session.step || IVR_STEPS.RSVP
  };

  Object.keys(entries).sort().forEach((key) => {
    url.searchParams.set(key, entries[key]);
  });

  return url.toString();
};

const loadGuestContext = async (guestId) => guestRepository.findByIdWithEvent(guestId);

const loadIvrContext = async (guestId) => {
  const guest = await loadGuestContext(guestId);

  if (!guest) {
    return null;
  }

  const hotels = await hotelRepository.findManyByEvent(guest.eventId);
  const transportEnabled = parseBool(env.voiceTransportEnabled, true);
  const hotelEnabled = parseBool(env.voiceHotelEnabled, hotels.length > 0);

  return {
    guest,
    eventName: guest.event?.name || 'your event',
    existingPickup: (guest.pickupLocation || '').trim(),
    transportEnabled,
    hotelEnabled
  };
};

const mapSessionToOutcome = (session) => {
  switch (session.rsvp) {
    case '1':
      return {
        callOutcome: 'completed',
        rsvpStatus: 'CONFIRMED',
        thankYouMessage: 'Thank you. Your attendance is confirmed. Goodbye.'
      };
    case '2':
      return {
        callOutcome: 'declined',
        rsvpStatus: 'DECLINED',
        thankYouMessage: 'Thank you for letting us know. Goodbye.'
      };
    case '3':
      return {
        callOutcome: 'maybe',
        rsvpStatus: 'PENDING',
        thankYouMessage: 'Thank you. We have noted that you may attend. Goodbye.'
      };
    case '4':
      return {
        callOutcome: 'callback_later',
        rsvpStatus: 'PENDING',
        thankYouMessage: 'Thank you. We will call you back later. Goodbye.'
      };
    default:
      return {
        callOutcome: 'no_answer',
        rsvpStatus: 'PENDING',
        thankYouMessage: 'Thank you. Goodbye.'
      };
  }
};

const resolveNextStep = (session, context) => {
  if (session.rsvp !== '1') {
    return null;
  }

  if (session.step === IVR_STEPS.RSVP) {
    return IVR_STEPS.GROUP_SIZE;
  }

  if (session.step === IVR_STEPS.GROUP_SIZE) {
    if (context.existingPickup) {
      return IVR_STEPS.PICKUP;
    }

    return resolveCabOrHotelStep(session, context);
  }

  if (session.step === IVR_STEPS.PICKUP) {
    return resolveCabOrHotelStep(session, context);
  }

  if (session.step === IVR_STEPS.CAB) {
    if (context.hotelEnabled && session.needsHotel === null) {
      return IVR_STEPS.HOTEL;
    }

    return null;
  }

  if (session.step === IVR_STEPS.HOTEL) {
    return null;
  }

  return null;
};

const resolveCabOrHotelStep = (session, context) => {
  if (context.transportEnabled && session.needsCab === null) {
    return IVR_STEPS.CAB;
  }

  if (context.hotelEnabled && session.needsHotel === null) {
    return IVR_STEPS.HOTEL;
  }

  return null;
};

const parseGroupSizeDigits = (digitPressed) => {
  const raw = String(digitPressed || '').trim();

  if (!/^\d{1,2}$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
    return null;
  }

  return parsed;
};

const buildGetDigitsXml = ({ prompt, retryPrompt, actionUrl, numDigits = '1' }) => `  <GetDigits action="${escapeXml(actionUrl)}" method="POST" timeout="12" numDigits="${numDigits}" retries="2">
    <Speak>${escapeXml(retryPrompt || prompt)}</Speak>
  </GetDigits>
  <Speak>${escapeXml(prompt)}</Speak>`;

const buildStepXml = ({ step, context, session, actionUrl }) => {
  switch (step) {
    case IVR_STEPS.RSVP: {
      const prompt = `Hello. This is Event Pilot calling about ${context.eventName}. Press 1 to confirm you will attend. Press 2 if you cannot attend. Press 3 if you are not sure yet. Press 4 to request a callback later.`;
      return buildGetDigitsXml({
        prompt,
        retryPrompt: 'Press 1 to confirm, 2 to decline, 3 for maybe, or 4 for a callback later.',
        actionUrl
      });
    }
    case IVR_STEPS.GROUP_SIZE: {
      const prompt = 'How many people will attend including yourself? Enter a two digit number. For example, press 0 then 5 for five people, or 1 then 2 for twelve people.';
      return buildGetDigitsXml({
        prompt,
        retryPrompt: 'Enter your group size as two digits. For five people, press 0 then 5.',
        actionUrl,
        numDigits: '2'
      });
    }
    case IVR_STEPS.PICKUP: {
      const pickup = escapeXml(context.existingPickup);
      const prompt = `We have ${pickup} as your pickup location. Press 1 to keep this pickup location. Press 2 to skip updating pickup.`;
      return buildGetDigitsXml({
        prompt,
        retryPrompt: 'Press 1 to keep your pickup location, or 2 to skip.',
        actionUrl
      });
    }
    case IVR_STEPS.CAB: {
      const prompt = 'Do you need cab or transport assistance? Press 1 for yes. Press 2 for no.';
      return buildGetDigitsXml({
        prompt,
        retryPrompt: 'Press 1 if you need a cab, or 2 if you do not.',
        actionUrl
      });
    }
    case IVR_STEPS.HOTEL: {
      const prompt = 'Do you need hotel accommodation? Press 1 for yes. Press 2 for no.';
      return buildGetDigitsXml({
        prompt,
        retryPrompt: 'Press 1 if you need a hotel room, or 2 if you do not.',
        actionUrl
      });
    }
    default:
      return '  <Speak>Invalid step. Goodbye.</Speak>';
  }
};

const buildContinueXml = ({ context, session, actionUrl, step }) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${buildStepXml({ step, context, session, actionUrl })}
  <Speak>We did not receive a response. Goodbye.</Speak>
  <Hangup/>
</Response>`;

const buildThankYouXml = (message) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>${escapeXml(message)}</Speak>
  <Hangup/>
</Response>`;

const buildAnswerXml = async ({ guestId, callId }) => {
  if (!guestId) {
    return buildThankYouXml('We could not identify this call. Goodbye.');
  }

  const context = await loadIvrContext(guestId);

  if (!context) {
    return buildThankYouXml('We could not find your invitation. Goodbye.');
  }

  const session = { step: IVR_STEPS.RSVP };
  const actionUrl = buildDigitActionUrl(guestId, callId, session);

  return buildContinueXml({
    context,
    session,
    actionUrl,
    step: IVR_STEPS.RSVP
  });
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

const applyRsvpDigit = (session, digit) => {
  if (!['1', '2', '3', '4'].includes(String(digit))) {
    return { ok: false };
  }

  return {
    ok: true,
    session: {
      ...session,
      step: IVR_STEPS.RSVP,
      rsvp: String(digit)
    }
  };
};

const applyGroupSizeDigit = (session, digit) => {
  const groupSize = parseGroupSizeDigits(digit);

  if (!groupSize) {
    return { ok: false };
  }

  return {
    ok: true,
    session: {
      ...session,
      step: IVR_STEPS.GROUP_SIZE,
      groupSize
    }
  };
};

const applyPickupDigit = (session, digit) => {
  if (!['1', '2'].includes(String(digit))) {
    return { ok: false };
  }

  return {
    ok: true,
    session: {
      ...session,
      step: IVR_STEPS.PICKUP,
      keepPickup: String(digit) === '1'
    }
  };
};

const applyYesNoDigit = (session, digit, field, step) => {
  if (!['1', '2'].includes(String(digit))) {
    return { ok: false };
  }

  return {
    ok: true,
    session: {
      ...session,
      step,
      [field]: String(digit) === '1'
    }
  };
};

const processDigitForStep = (session, digit, context) => {
  switch (session.step) {
    case IVR_STEPS.RSVP:
      return applyRsvpDigit(session, digit);
    case IVR_STEPS.GROUP_SIZE:
      return applyGroupSizeDigit(session, digit);
    case IVR_STEPS.PICKUP:
      return applyPickupDigit(session, digit);
    case IVR_STEPS.CAB:
      return applyYesNoDigit(session, digit, 'needsCab', IVR_STEPS.CAB);
    case IVR_STEPS.HOTEL:
      return applyYesNoDigit(session, digit, 'needsHotel', IVR_STEPS.HOTEL);
    default:
      return { ok: false };
  }
};

const finalizeAndThankYou = async ({
  guestId,
  callId,
  session,
  context,
  plivoPayload
}) => {
  const outcome = mapSessionToOutcome(session);
  const callbackAt = outcome.callOutcome === 'callback_later'
    ? new Date(Date.now() + 24 * 60 * 60 * 1000)
    : null;

  await ivrService.handleWebhook({
    guestId,
    callId,
    callUuid: readPlivoCallUuid(plivoPayload),
    callStatus: 'COMPLETED',
    attempt: 1,
    callDuration: readPlivoCallDuration(plivoPayload),
    responseInput: session.rsvp,
    callOutcome: outcome.callOutcome,
    rsvpStatus: outcome.rsvpStatus,
    groupSize: session.groupSize ?? undefined,
    pickupLocation: session.keepPickup ? context.existingPickup : undefined,
    needsCab: session.needsCab ?? undefined,
    needsHotel: session.needsHotel ?? undefined,
    callbackAt
  });

  return outcome.thankYouMessage;
};

const buildDigitXml = async ({
  guestId,
  callId,
  digitPressed,
  plivoPayload = {},
  sessionParams = {}
}) => {
  if (!guestId || !digitPressed) {
    return buildThankYouXml('Invalid response. Goodbye.');
  }

  const context = await loadIvrContext(guestId);

  if (!context) {
    return buildThankYouXml('We could not find your invitation. Goodbye.');
  }

  const session = parseSession(sessionParams);
  const digitResult = processDigitForStep(session, digitPressed, context);

  if (!digitResult.ok) {
    const actionUrl = buildDigitActionUrl(guestId, callId, session);
    return buildContinueXml({
      context,
      session,
      actionUrl,
      step: session.step
    });
  }

  const updatedSession = digitResult.session;
  const nextStep = resolveNextStep(updatedSession, context);

  if (nextStep) {
    const nextSession = { ...updatedSession, step: nextStep };
    const actionUrl = buildDigitActionUrl(guestId, callId, nextSession);

    return buildContinueXml({
      context,
      session: nextSession,
      actionUrl,
      step: nextStep
    });
  }

  const thankYouMessage = await finalizeAndThankYou({
    guestId,
    callId,
    session: updatedSession,
    context,
    plivoPayload
  });

  return buildThankYouXml(thankYouMessage);
};

const buildDigitErrorXml = () => buildThankYouXml(
  'We could not save your response. Please contact the event organizer. Goodbye.'
);

module.exports = {
  IVR_STEPS,
  buildAnswerXml,
  buildDigitXml,
  buildDigitErrorXml,
  buildDigitActionUrl,
  getWebhookBaseUrl,
  parseSession,
  resolveNextStep,
  parseGroupSizeDigits
};
