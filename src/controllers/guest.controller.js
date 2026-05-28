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

const updateGuestRsvp = async (req, res, next) => {
  try {
    const guest = await guestService.updateGuestRsvp(req.params.id, req.body, req.user);
    response.success(res, guest, 'Guest RSVP updated successfully');
  } catch (error) {
    next(error);
  }
};

const getGuestRsvpLink = async (req, res, next) => {
  try {
    const link = await guestService.getGuestRsvpLink(req.params.id, req.user);
    response.success(res, link, 'Guest RSVP link ready');
  } catch (error) {
    next(error);
  }
};

const getGuestCallLogs = async (req, res, next) => {
  try {
    const logs = await guestService.getGuestCallLogs(req.params.id, req.user);
    response.success(res, logs, 'Guest call logs fetched');
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
  updateGuestRsvp,
  getGuestRsvpLink,
  getGuestCallLogs,
  deleteGuest,
  uploadCsv
};
