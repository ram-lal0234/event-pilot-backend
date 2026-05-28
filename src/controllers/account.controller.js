const accountService = require('../services/account.service');
const teamService = require('../services/team.service');
const response = require('../utils/response');

const getMe = async (req, res, next) => {
  try {
    const data = await accountService.getAccountMe(req.user.id);
    response.success(res, data, 'Account loaded');
  } catch (error) {
    next(error);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const account = await accountService.updateAccountName(req.user.id, req.body.name);
    response.success(res, account, 'Account updated');
  } catch (error) {
    next(error);
  }
};

const listMembers = async (req, res, next) => {
  try {
    const members = await teamService.listMembers(req.user.id);
    response.success(res, members, 'Team members loaded');
  } catch (error) {
    next(error);
  }
};

const inviteMember = async (req, res, next) => {
  try {
    const member = await teamService.inviteMember(req.user.id, req.body);
    response.created(res, member, 'Invitation sent');
  } catch (error) {
    next(error);
  }
};

const revokeMember = async (req, res, next) => {
  try {
    const result = await teamService.revokeMember(req.user.id, req.params.id);
    response.success(res, result, 'Member revoked');
  } catch (error) {
    next(error);
  }
};

const updateMemberRole = async (req, res, next) => {
  try {
    const member = await teamService.updateMemberRole(req.user.id, req.params.id, req.body);
    response.success(res, member, 'Member role updated');
  } catch (error) {
    next(error);
  }
};

const updateMemberEvents = async (req, res, next) => {
  try {
    const member = await teamService.updateMemberEvents(req.user.id, req.params.id, req.body);
    response.success(res, member, 'Event access updated');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMe,
  updateMe,
  listMembers,
  inviteMember,
  revokeMember,
  updateMemberRole,
  updateMemberEvents
};
