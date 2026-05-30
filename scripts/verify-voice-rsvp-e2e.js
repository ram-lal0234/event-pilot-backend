#!/usr/bin/env node
/**
 * P0 E2E check: POST RSVP webhook → guest updated + Call row linked by callUuid.
 *
 * Prerequisites:
 * 1. Backend running (local: npm run dev, or deployed API_URL)
 * 2. Guest exists with rsvpStatus PENDING
 * 3. Call row exists for that guest (trigger call from dashboard first)
 * 4. Call row has callUuid set OR pass CALL_UUID to attach on webhook
 *
 * Usage:
 *   GUEST_ID=<uuid> CALL_ID=<uuid> CALL_UUID=<plivo-uuid> \\
 *     VOICE_AI_WEBHOOK_SECRET=<secret> node scripts/verify-voice-rsvp-e2e.js
 *
 * Optional: DATABASE_URL for direct DB verification (requires psql or prisma).
 */

const guestId = process.env.GUEST_ID;
const callId = process.env.CALL_ID;
const callUuid = process.env.CALL_UUID || `verify-${Date.now()}`;
const apiUrl = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const voiceSecret = process.env.VOICE_AI_WEBHOOK_SECRET || '';

const required = [
  ['GUEST_ID', guestId],
  ['CALL_ID', callId]
];

const missing = required.filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error('Missing required env:', missing.join(', '));
  console.error('\nExample:');
  console.error('  GUEST_ID=... CALL_ID=... CALL_UUID=... node scripts/verify-voice-rsvp-e2e.js');
  process.exit(1);
}

const payload = {
  guest_id: guestId,
  call_id: callId,
  callUuid,
  callOutcome: 'completed',
  rsvpStatus: 'CONFIRMED',
  groupSize: 2,
  language: 'en'
};

const headers = {
  'Content-Type': 'application/json'
};

if (voiceSecret) {
  headers['X-EventPilot-Voice-Secret'] = voiceSecret;
}

async function main() {
  const url = `${apiUrl}/api/voice/ai/rsvp`;

  console.log('POST', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));

  console.log('\nHTTP', response.status);
  console.log(JSON.stringify(body, null, 2));

  if (!response.ok) {
    process.exit(1);
  }

  const data = body.data || body;
  const callLink = data.callLink;

  if (!data.rsvpUpdated && !data.duplicate) {
    console.error('\nFAIL: guest RSVP was not updated');
    process.exit(1);
  }

  if (!callLink?.callLinked) {
    console.error('\nFAIL: Call row was not linked. Ensure CALL_ID matches the queued call and callUuid is correct.');
    process.exit(1);
  }

  if (callLink.callUuid !== callUuid) {
    console.error('\nFAIL: callUuid mismatch', { expected: callUuid, got: callLink.callUuid });
    process.exit(1);
  }

  console.log('\nPASS: Guest RSVP updated and Call linked by callUuid');
  console.log('  callId:', callLink.callId);
  console.log('  callUuid:', callLink.callUuid);
  console.log('  status:', callLink.status);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
