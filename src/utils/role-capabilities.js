const AppError = require('./AppError');

const PLANNER_ROLES = new Set(['OWNER', 'ADMIN', 'STAFF']);
const FIELD_ROLES = new Set(['DRIVER', 'HOTEL']);

const isPlannerRole = (role) => PLANNER_ROLES.has(role);
const isFieldRole = (role) => FIELD_ROLES.has(role);

const assertPlannerRole = (role, message = 'This action requires a planner role') => {
  if (!isPlannerRole(role)) {
    throw new AppError(message, 403, 'PLANNER_ROLE_REQUIRED');
  }
};

module.exports = {
  PLANNER_ROLES,
  FIELD_ROLES,
  isPlannerRole,
  isFieldRole,
  assertPlannerRole
};
