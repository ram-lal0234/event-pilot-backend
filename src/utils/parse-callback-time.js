const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const toIstWallClock = (date) => {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes()
  };
};

const istWallClockToDate = ({ year, month, day, hours, minutes }) => (
  new Date(Date.UTC(year, month, day, hours, minutes, 0, 0) - IST_OFFSET_MS)
);

/**
 * Parse natural-language callback hints (IST) from guestNotes or similar text.
 * @param {string|null|undefined} notes
 * @param {Date} callReceivedAt
 * @returns {Date|null}
 */
const parseCallbackTime = (notes, callReceivedAt = new Date()) => {
  if (!notes || typeof notes !== 'string') {
    return null;
  }

  const text = notes.toLowerCase();
  const base = toIstWallClock(callReceivedAt);

  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2] || '0', 10);
    const meridiem = timeMatch[3].toLowerCase();

    if (meridiem === 'pm' && hours < 12) {
      hours += 12;
    }
    if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }

    let callback = istWallClockToDate({
      year: base.year,
      month: base.month,
      day: base.day,
      hours,
      minutes
    });

    if (callback <= callReceivedAt) {
      callback = istWallClockToDate({
        year: base.year,
        month: base.month,
        day: base.day + 1,
        hours,
        minutes
      });
    }

    return callback;
  }

  const bajeMatch = text.match(/(\d{1,2})\s*(?:baje|बजे)/i);
  if (bajeMatch) {
    let hours = parseInt(bajeMatch[1], 10);
    if (hours >= 1 && hours <= 11) {
      hours += 12;
    }

    let callback = istWallClockToDate({
      year: base.year,
      month: base.month,
      day: base.day,
      hours,
      minutes: 0
    });

    if (callback <= callReceivedAt) {
      callback = istWallClockToDate({
        year: base.year,
        month: base.month,
        day: base.day + 1,
        hours,
        minutes: 0
      });
    }

    return callback;
  }

  if (text.includes('kal') || text.includes('tomorrow')) {
    return istWallClockToDate({
      year: base.year,
      month: base.month,
      day: base.day + 1,
      hours: 10,
      minutes: 0
    });
  }

  if (text.includes('callback') || text.includes('call me') || text.includes('call back')) {
    return new Date(callReceivedAt.getTime() + 2 * 60 * 60 * 1000);
  }

  return null;
};

const parseCallbackAtPayload = (rawCallbackAt, notes, callReceivedAt = new Date()) => {
  if (rawCallbackAt) {
    const parsed = new Date(rawCallbackAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return parseCallbackTime(notes, callReceivedAt);
};

module.exports = {
  parseCallbackTime,
  parseCallbackAtPayload
};
