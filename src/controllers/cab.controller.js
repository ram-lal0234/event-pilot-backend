const cabService = require('../services/cab.service');
const response = require('../utils/response');

const createCab = async (req, res, next) => {
  try {
    const cab = await cabService.createCab(req.body, req.user);
    response.created(res, cab, 'Cab created successfully');
  } catch (error) {
    next(error);
  }
};

const assignGuest = async (req, res, next) => {
  try {
    const assignment = await cabService.assignGuest(req.body, req.user);
    response.created(res, assignment, 'Guest assigned to cab');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCab,
  assignGuest
};
