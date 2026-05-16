const dashboardService = require('../services/dashboard.service');
const response = require('../utils/response');

const summary = async (req, res, next) => {
  try {
    const result = await dashboardService.getSummary(req.query, req.user);
    response.success(res, result);
  } catch (error) {
    next(error);
  }
};

const liveFeed = async (req, res, next) => {
  try {
    const result = await dashboardService.getLiveFeed(req.query, req.user);
    response.success(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  summary,
  liveFeed
};
