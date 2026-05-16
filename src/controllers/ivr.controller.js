const guestService = require('../services/guest.service');
const ivrService = require('../services/ivr.service');
const response = require('../utils/response');

const triggerCall = async (req, res, next) => {
  try {
    const result = await guestService.triggerIvr(req.body.guestId, req.user);
    response.success(res, result, 'IVR call queued');
  } catch (error) {
    next(error);
  }
};

const webhook = async (req, res, next) => {
  try {
    const result = await ivrService.handleWebhook(req.body);
    response.success(res, result, 'IVR response captured');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  triggerCall,
  webhook
};
