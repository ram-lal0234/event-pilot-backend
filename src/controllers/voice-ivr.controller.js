const plivoIvrXml = require('../services/plivo-ivr-xml.service');
const logger = require('../utils/logger');

const xmlResponse = (res, body) => {
  res.set('Content-Type', 'application/xml');
  res.status(200).send(body);
};

const answer = async (req, res, next) => {
  try {
    const guestId = req.query.guestId || req.body?.guestId;
    const callId = req.query.callId || req.body?.callId;
    const xml = await plivoIvrXml.buildAnswerXml({ guestId, callId });
    return xmlResponse(res, xml);
  } catch (error) {
    next(error);
  }
};

const digit = async (req, res, next) => {
  try {
    const guestId = req.query.guestId || req.body?.guestId;
    const callId = req.query.callId || req.body?.callId;
    const digitPressed = req.body?.Digits || req.query?.Digits;
    const xml = await plivoIvrXml.buildDigitXml({
      guestId,
      callId,
      digitPressed,
      plivoPayload: { ...req.query, ...req.body }
    });
    return xmlResponse(res, xml);
  } catch (error) {
    logger.error(error, { guestId: req.query.guestId, path: req.path });
    return xmlResponse(res, plivoIvrXml.buildDigitErrorXml());
  }
};

module.exports = {
  answer,
  digit
};
