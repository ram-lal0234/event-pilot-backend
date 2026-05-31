const eventService = require('../services/event.service');
const response = require('../utils/response');

const createEvent = async (req, res, next) => {
  try {
    const event = await eventService.createEvent(req.body, req.user);
    response.created(res, event, 'Event created successfully');
  } catch (error) {
    next(error);
  }
};

const listEvents = async (req, res, next) => {
  try {
    const events = await eventService.listEvents(req.user);
    response.success(res, events);
  } catch (error) {
    next(error);
  }
};

const getEvent = async (req, res, next) => {
  try {
    const event = await eventService.getEvent(req.params.id, req.user);
    response.success(res, event);
  } catch (error) {
    next(error);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const event = await eventService.updateEvent(req.params.id, req.body, req.user);
    response.success(res, event, 'Event updated');
  } catch (error) {
    next(error);
  }
};

const listArchivedEvents = async (req, res, next) => {
  try {
    const events = await eventService.listArchivedEvents(req.user);
    response.success(res, events, 'Archived events loaded');
  } catch (error) {
    next(error);
  }
};

const archiveEvent = async (req, res, next) => {
  try {
    const result = await eventService.archiveEvent(req.params.id, req.user);
    response.success(res, result, 'Event archived');
  } catch (error) {
    next(error);
  }
};

const restoreEvent = async (req, res, next) => {
  try {
    const result = await eventService.restoreEvent(req.params.id, req.user);
    response.success(res, result, 'Event restored');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEvent,
  listEvents,
  listArchivedEvents,
  getEvent,
  updateEvent,
  archiveEvent,
  restoreEvent
};
