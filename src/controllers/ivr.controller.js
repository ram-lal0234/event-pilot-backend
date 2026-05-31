const guestService = require('../services/guest.service');
const response = require('../utils/response');

const triggerCall = async (req, res, next) => {
  try {
    const result = await guestService.triggerIvr(req.body.guestId, req.user, req.body.callMode);
    response.success(res, result, 'We are calling this guest now');
  } catch (error) {
    next(error);
  }
};

const triggerBulkCall = async (req, res, next) => {
  try {
    const result = await guestService.triggerBulkIvr(
      req.body.eventId,
      req.user,
      req.body.callMode
    );
    const callLabel = result.callMode === 'ai' ? 'assistant' : 'keypad';
    response.success(
      res,
      result,
      result.queued
        ? `Started ${result.queued} ${callLabel} call${result.queued === 1 ? '' : 's'}`
        : 'No calls were started'
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  triggerCall,
  triggerBulkCall
};
