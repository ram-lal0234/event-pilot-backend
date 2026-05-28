const qrService = require('../services/qr.service');
const response = require('../utils/response');

const scan = async (req, res, next) => {
  try {
    const result = await qrService.scan(req.body, req.user);
    response.created(res, result, result.alreadyCheckedIn ? 'Guest already checked in' : 'Check-in completed');
  } catch (error) {
    next(error);
  }
};

const undo = async (req, res, next) => {
  try {
    const result = await qrService.undo(req.body, req.user);
    response.success(res, result, 'Check-in undone');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  scan,
  undo
};
