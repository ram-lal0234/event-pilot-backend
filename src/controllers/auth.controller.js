const authService = require('../services/auth.service');
const response = require('../utils/response');

const login = async (req, res, next) => {
  try {
    const result = await authService.requestLoginOtp(req.body);
    response.success(res, result, 'OTP generated');
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyOtp(req.body);
    response.success(res, result, 'Authenticated');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  verifyOtp
};
