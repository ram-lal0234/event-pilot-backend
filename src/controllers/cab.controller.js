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

const listCabs = async (req, res, next) => {
  try {
    const cabs = await cabService.listCabs(req.query, req.user);
    response.success(res, cabs);
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

const unassignGuest = async (req, res, next) => {
  try {
    const assignment = await cabService.unassignGuest(req.body, req.user);
    response.success(res, assignment, 'Guest unassigned from cab');
  } catch (error) {
    next(error);
  }
};

const moveGuest = async (req, res, next) => {
  try {
    const assignment = await cabService.moveGuest(req.body, req.user);
    response.success(res, assignment, 'Guest moved to another cab');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCab,
  listCabs,
  assignGuest,
  unassignGuest,
  moveGuest
};
