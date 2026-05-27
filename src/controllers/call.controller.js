const callService = require('../services/call.service');
const response = require('../utils/response');

const startCall = async (req, res, next) => {
  try {
    const result = await callService.startCall(req.body.guestId, req.user);
    response.success(res, result, 'Call queued');
  } catch (error) {
    next(error);
  }
};

const getCallStatus = async (req, res, next) => {
  try {
    const result = await callService.getCallStatus(req.params.id, req.user);
    response.success(res, result, 'Call status fetched');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startCall,
  getCallStatus
};
