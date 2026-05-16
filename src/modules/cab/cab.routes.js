const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const cabController = require('../../controllers/cab.controller');
const { createCabSchema, assignCabSchema } = require('../../validators/cab.validator');
const { dashboardQuerySchema } = require('../../validators/dashboard.validator');

const router = express.Router();

router.use(authenticate);
router
  .route('/')
  .post(validate({ body: createCabSchema }), cabController.createCab)
  .get(validate({ query: dashboardQuerySchema }), cabController.listCabs);
router.post('/assignments', validate({ body: assignCabSchema }), cabController.assignGuest);

module.exports = router;
