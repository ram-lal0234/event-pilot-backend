const callRepository = require('../repositories/call.repository');
const ivrRepository = require('../repositories/ivr.repository');
const auditService = require('./audit.service');
const logger = require('../utils/logger');

const normalizeTranscriptPayload = (body = {}) => {
  const root = body.data?.object ? body : { data: { object: body } };
  const object = root.data?.object || {};
  const eventData = object.event_data || object.eventData || {};

  const eventName = String(object.event_name || object.eventName || 'recording').toLowerCase();
  const recordingUrl = eventData.recording_url || eventData.recordingUrl || object.recording_url || '';
  const transcription = eventData.transcription || object.transcription || '';

  return {
    plivoEventId: root.id || body.id || null,
    createdAt: root.created_at || root.createdAt || body.created_at || null,
    callUuid: object.call_uuid || object.callUuid || body.call_uuid || body.callUuid || null,
    conversationId: object.conversation_id || object.conversationId || null,
    conversationUrl: object.conversation_url || object.conversationUrl || null,
    eventName,
    flowName: object.flow_name || object.flowName || null,
    flowRunUuid: object.flow_run_uuid || object.flowRunUuid || null,
    flowUuid: object.flow_uuid || object.flowUuid || null,
    nodeName: object.node_name || object.nodeName || null,
    recordingUrl: recordingUrl ? String(recordingUrl) : '',
    transcription: transcription ? String(transcription) : ''
  };
};

const buildIdempotencyKey = (normalized) => {
  const parts = [
    'plivo-ai-transcript',
    normalized.plivoEventId,
    normalized.callUuid,
    normalized.eventName,
    normalized.flowRunUuid,
    normalized.recordingUrl,
    normalized.transcription.slice(0, 64)
  ].filter(Boolean);

  return parts.join(':');
};

const handleTranscriptEvent = async (rawBody) => {
  const normalized = normalizeTranscriptPayload(rawBody);

  if (!normalized.callUuid) {
    logger.warn('AI transcript webhook missing call_uuid', { eventName: normalized.eventName });
    return {
      kind: 'ai/transcript',
      processed: false,
      reason: 'CALL_UUID_MISSING'
    };
  }

  const call = await callRepository.findByCallUuid(normalized.callUuid);
  const idempotencyKey = buildIdempotencyKey(normalized);

  try {
    await callRepository.createEvent({
      callId: call?.id,
      callUuid: normalized.callUuid,
      provider: 'plivo',
      type: `ai:${normalized.eventName}`,
      idempotencyKey,
      payload: rawBody
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return {
        kind: 'ai/transcript',
        duplicate: true,
        callUuid: normalized.callUuid,
        eventName: normalized.eventName
      };
    }

    throw error;
  }

  const responseInput = JSON.stringify({
    kind: 'ai/transcript',
    eventName: normalized.eventName,
    recordingUrl: normalized.recordingUrl || null,
    transcription: normalized.transcription || null,
    conversationId: normalized.conversationId,
    conversationUrl: normalized.conversationUrl,
    flowName: normalized.flowName,
    flowRunUuid: normalized.flowRunUuid,
    flowUuid: normalized.flowUuid,
    nodeName: normalized.nodeName
  });

  if (call) {
    await ivrRepository.createLog({
      eventId: call.eventId,
      guestId: call.guestId,
      callStatus: normalized.eventName.toUpperCase(),
      attempt: 1,
      callDuration: null,
      responseInput,
      rsvpCaptured: false,
      groupSizeCaptured: false
    });

    await auditService.enqueueAuditLog({
      eventId: call.eventId,
      action: 'AI_VOICE_TRANSCRIPT_RECEIVED',
      entityType: 'Call',
      entityId: call.id,
      metadata: {
        callUuid: normalized.callUuid,
        eventName: normalized.eventName,
        hasRecording: Boolean(normalized.recordingUrl),
        hasTranscription: Boolean(normalized.transcription),
        flowName: normalized.flowName
      }
    });
  } else {
    logger.info('AI transcript stored without linked Call row', {
      callUuid: normalized.callUuid,
      eventName: normalized.eventName
    });
  }

  return {
    kind: 'ai/transcript',
    processed: true,
    callFound: Boolean(call),
    callUuid: normalized.callUuid,
    eventName: normalized.eventName,
    hasRecording: Boolean(normalized.recordingUrl),
    hasTranscription: Boolean(normalized.transcription)
  };
};

module.exports = {
  normalizeTranscriptPayload,
  handleTranscriptEvent
};
