const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const accountController = require('../../controllers/account.controller');
const {
  updateAccountSchema,
  updateProfileSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateMemberEventsSchema,
  memberIdParamSchema
} = require('../../validators/account.validator');

const router = express.Router();

router.use(authenticate);

router.get('/me', accountController.getMe);
router.patch('/me/profile', validate({ body: updateProfileSchema }), accountController.updateProfile);
router.patch('/me', validate({ body: updateAccountSchema }), accountController.updateMe);
router.get('/members', accountController.listMembers);
router.post('/members/invite', validate({ body: inviteMemberSchema }), accountController.inviteMember);
router.post('/members/:id/revoke', validate({ params: memberIdParamSchema }), accountController.revokeMember);
router.patch('/members/:id', validate({ params: memberIdParamSchema, body: updateMemberRoleSchema }), accountController.updateMemberRole);
router.put('/members/:id/events', validate({ params: memberIdParamSchema, body: updateMemberEventsSchema }), accountController.updateMemberEvents);

module.exports = router;
