const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCallLinkPatch,
  resolveTerminalCallStatus
} = require('../../src/services/voice-ai.service');

test('resolveTerminalCallStatus marks no_answer as FAILED', () => {
  assert.equal(resolveTerminalCallStatus('no_answer'), 'FAILED');
  assert.equal(resolveTerminalCallStatus('completed'), 'COMPLETED');
});

test('buildCallLinkPatch attaches callUuid and completes active call', () => {
  const call = {
    id: 'call-1',
    status: 'AI_ACTIVE',
    callUuid: null
  };

  const patch = buildCallLinkPatch(call, {
    callUuid: 'plivo-uuid-123',
    callOutcome: 'completed'
  });

  assert.equal(patch.callUuid, 'plivo-uuid-123');
  assert.equal(patch.status, 'COMPLETED');
  assert.ok(patch.lastEventAt instanceof Date);
});

test('buildCallLinkPatch keeps existing callUuid when already set', () => {
  const call = {
    id: 'call-1',
    status: 'COMPLETED',
    callUuid: 'existing-uuid'
  };

  const patch = buildCallLinkPatch(call, {
    callUuid: 'new-uuid',
    callOutcome: 'completed'
  });

  assert.equal(patch.callUuid, undefined);
  assert.equal(patch.status, undefined);
});

test('buildCallLinkPatch fails no_answer calls', () => {
  const call = {
    id: 'call-1',
    status: 'RINGING',
    callUuid: 'plivo-uuid-123'
  };

  const patch = buildCallLinkPatch(call, {
    callUuid: 'plivo-uuid-123',
    callOutcome: 'no_answer'
  });

  assert.equal(patch.status, 'FAILED');
});
