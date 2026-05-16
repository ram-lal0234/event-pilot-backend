const qrService = require('../services/qr.service');
const response = require('../utils/response');

const scan = async (req, res, next) => {
  try {
    const result = await qrService.scan(req.body, req.user);
    response.created(res, result, 'Check-in completed');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  scan
};
