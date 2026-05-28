const callRepository = require('../repositories/call.repository');
const auditService = require('./audit.service');
const logger = require('../utils/logger');

const normalizeErrorPayload = (body = {}) => {
  const object = body.data?.object || body;
  const eventData = object.event_data || object.eventData || body.event_data || {};

  return {
    plivoEventId: body.id || body.event_id || null,
    callUuid: object.call_uuid || object.callUuid || body.call_uuid || body.callUuid || null,
    conversationId: object.conversation_id || object.conversationId || null,
    flowName: object.flow_name || object.flowName || null,
    flowRunUuid: object.flow_run_uuid || object.flowRunUuid || null,
    flowUuid: object.flow_uuid || object.flowUuid || null,
    nodeName: object.node_name || object.nodeName || null,
    eventName: String(object.event_name || object.eventName || body.event_name || 'error').toLowerCase(),
    errorMessage: eventData.error || eventData.message || body.error || body.message || body.error_message || null,
    errorCode: eventData.code || body.code || body.error_code || null,
    raw: body
  };
};

const buildIdempotencyKey = (normalized) => [
  'plivo-ai-error',
  normalized.plivoEventId,
  normalized.callUuid,
  normalized.eventName,
  normalized.errorCode,
  String(normalized.errorMessage || '').slice(0, 64)
].filter(Boolean).join(':');

const handleErrorEvent = async (rawBody) => {
  const normalized = normalizeErrorPayload(rawBody);

  logger.error('Plivo AI flow error webhook', {
    callUuid: normalized.callUuid,
    eventName: normalized.eventName,
    errorMessage: normalized.errorMessage,
    errorCode: normalized.errorCode,
    flowName: normalized.flowName
  });

  const call = normalized.callUuid
    ? await callRepository.findByCallUuid(normalized.callUuid)
    : null;

  if (normalized.callUuid) {
    try {
      await callRepository.createEvent({
        callId: call?.id,
        callUuid: normalized.callUuid,
        provider: 'plivo',
        type: `ai:error:${normalized.eventName}`,
        idempotencyKey: buildIdempotencyKey(normalized),
        payload: rawBody
      });
    } catch (error) {
      if (error?.code !== 'P2002') {
        throw error;
      }
    }
  }

  if (call) {
    await callRepository.update(call.id, {
      status: 'FAILED',
      lastEventAt: new Date()
    });

    await auditService.enqueueAuditLog({
      eventId: call.eventId,
      action: 'AI_VOICE_CALL_ERROR',
      entityType: 'Call',
      entityId: call.id,
      metadata: {
        callUuid: normalized.callUuid,
        eventName: normalized.eventName,
        errorMessage: normalized.errorMessage,
        errorCode: normalized.errorCode,
        flowName: normalized.flowName
      }
    });
  }

  return {
    kind: 'ai/error',
    processed: true,
    callFound: Boolean(call),
    callUuid: normalized.callUuid,
    eventName: normalized.eventName
  };
};

module.exports = {
  normalizeErrorPayload,
  handleErrorEvent
};
