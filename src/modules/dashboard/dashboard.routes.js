const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const dashboardController = require('../../controllers/dashboard.controller');
const { dashboardQuerySchema } = require('../../validators/dashboard.validator');

const router = express.Router();

router.use(authenticate);
router.get('/summary', validate({ query: dashboardQuerySchema }), dashboardController.summary);
router.get('/feed', validate({ query: dashboardQuerySchema }), dashboardController.liveFeed);

module.exports = router;
