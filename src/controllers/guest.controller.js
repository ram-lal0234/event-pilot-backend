const guestService = require('../services/guest.service');
const response = require('../utils/response');

const createGuest = async (req, res, next) => {
  try {
    const guest = await guestService.createGuest(req.body, req.user);
    response.created(res, guest, 'Guest created successfully');
  } catch (error) {
    next(error);
  }
};

const listGuests = async (req, res, next) => {
  try {
    const guests = await guestService.listGuests(req.query, req.user);
    response.success(res, guests);
  } catch (error) {
    next(error);
  }
};

const updateGuest = async (req, res, next) => {
  try {
    const guest = await guestService.updateGuest(req.params.id, req.body, req.user);
    response.success(res, guest, 'Guest updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteGuest = async (req, res, next) => {
  try {
    const result = await guestService.deleteGuest(req.params.id, req.user);
    response.success(res, result, 'Guest deleted successfully');
  } catch (error) {
    next(error);
  }
};

const uploadCsv = async (req, res, next) => {
  try {
    const result = await guestService.uploadCsv({
      eventId: req.query.eventId,
      csv: req.body
    }, req.user);
    response.created(res, result, 'Guest CSV uploaded successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGuest,
  listGuests,
  updateGuest,
  deleteGuest,
  uploadCsv
};
