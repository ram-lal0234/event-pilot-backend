const guestService = require('../services/guest.service');
const response = require('../utils/response');

const triggerCall = async (req, res, next) => {
  try {
    const result = await guestService.triggerIvr(req.body.guestId, req.user);
    response.success(res, result, 'IVR call queued');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  triggerCall
};
