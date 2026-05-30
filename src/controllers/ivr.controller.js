const guestService = require('../services/guest.service');
const response = require('../utils/response');

const triggerCall = async (req, res, next) => {
  try {
    const result = await guestService.triggerIvr(req.body.guestId, req.user, req.body.callMode);
    const label = result.callMode === 'ai' ? 'AI voice call' : 'IVR call';
    response.success(res, result, `${label} queued`);
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
    const label = result.callMode === 'ai' ? 'AI voice' : 'IVR';
    response.success(
      res,
      result,
      `${label} campaign queued ${result.queued} call(s)${result.skipped ? `, ${result.skipped} skipped` : ''}`
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  triggerCall,
  triggerBulkCall
};
