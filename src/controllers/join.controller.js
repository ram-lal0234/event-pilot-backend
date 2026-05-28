const teamService = require('../services/team.service');
const response = require('../utils/response');

const getPreview = async (req, res, next) => {
  try {
    const preview = await teamService.getJoinPreview(req.params.code);
    response.success(res, preview, 'Invite loaded');
  } catch (error) {
    next(error);
  }
};

const accept = async (req, res, next) => {
  try {
    const result = await teamService.acceptJoin(req.params.code, req.user);
    response.success(res, result, 'Invitation accepted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPreview,
  accept
};
