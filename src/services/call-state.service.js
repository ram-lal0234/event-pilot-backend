const transitions = {
  QUEUED: ['DIALING', 'FAILED'],
  DIALING: ['RINGING', 'ANSWERED', 'COMPLETED', 'FAILED'],
  RINGING: ['ANSWERED', 'COMPLETED', 'FAILED'],
  ANSWERED: ['AI_ACTIVE', 'COMPLETED', 'FAILED'],
  AI_ACTIVE: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: []
};

const rank = {
  QUEUED: 0,
  DIALING: 1,
  RINGING: 2,
  ANSWERED: 3,
  AI_ACTIVE: 4,
  COMPLETED: 5,
  FAILED: 5
};

const normalizePlivoStatus = (payload = {}) => {
  const rawStatus = String(
    payload.eventType
    || payload.event_type
    || payload.CallStatus
    || payload.callStatus
    || payload.Event
    || payload.event
    || payload.Status
    || payload.status
    || ''
  ).toLowerCase();

  if (rawStatus.includes('ring')) return 'RINGING';
  if (rawStatus.includes('answer') || rawStatus.includes('in-progress')) return 'ANSWERED';
  if (rawStatus.includes('ai') || rawStatus.includes('stream')) return 'AI_ACTIVE';
  if (rawStatus.includes('complete') || rawStatus.includes('hangup')) return 'COMPLETED';
  if (rawStatus.includes('fail') || rawStatus.includes('busy') || rawStatus.includes('no-answer') || rawStatus.includes('cancel')) {
    return 'FAILED';
  }

  return undefined;
};

const canTransition = (from, to) => {
  if (!from || from === to) {
    return true;
  }

  return transitions[from]?.includes(to) || false;
};

const isStaleTransition = (from, to) => rank[to] < rank[from];

module.exports = {
  normalizePlivoStatus,
  canTransition,
  isStaleTransition
};
