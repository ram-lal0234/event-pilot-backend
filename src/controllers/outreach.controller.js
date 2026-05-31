const outreachService = require('../services/outreach.service');
const response = require('../utils/response');

const getSummary = async (req, res, next) => {
  try {
    const summary = await outreachService.getOutreachSummary(req.params.id, req.user);
    response.success(res, summary);
  } catch (error) {
    next(error);
  }
};

const startBatch = async (req, res, next) => {
  try {
    const result = await outreachService.startOutreachForEvent(req.params.id, req.user);
    response.success(res, result, 'Outreach started for pending guests');
  } catch (error) {
    next(error);
  }
};

const startGuest = async (req, res, next) => {
  try {
    const result = await outreachService.startOutreachForGuest(req.params.id, req.user);
    response.success(res, result, result.sent ? 'WhatsApp invite sent' : 'Outreach not sent');
  } catch (error) {
    next(error);
  }
};

const pauseGuest = async (req, res, next) => {
  try {
    const guest = await outreachService.pauseOutreach(req.params.id, req.user);
    response.success(res, guest, 'Outreach paused');
  } catch (error) {
    next(error);
  }
};

const resendInitial = async (req, res, next) => {
  try {
    const result = await outreachService.startOutreachForGuest(req.params.id, req.user);
    response.success(res, result, result.sent ? 'WhatsApp invite resent' : 'Could not resend');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
  startBatch,
  startGuest,
  pauseGuest,
  resendInitial
};
