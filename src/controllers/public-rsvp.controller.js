const publicRsvpService = require('../services/public-rsvp.service');
const response = require('../utils/response');

const getByCode = async (req, res, next) => {
  try {
    const result = await publicRsvpService.getByCode(req.params);
    response.success(res, result, 'Invite loaded');
  } catch (error) {
    next(error);
  }
};

const submit = async (req, res, next) => {
  try {
    const result = await publicRsvpService.submit({
      code: req.params.code,
      payload: req.body
    });
    response.success(res, result, 'RSVP submitted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getByCode,
  submit
};
