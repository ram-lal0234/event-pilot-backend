const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const eventRoutes = require('../modules/event/event.routes');
const guestRoutes = require('../modules/guest/guest.routes');
const callRoutes = require('../modules/call/call.routes');
const ivrRoutes = require('../modules/ivr/ivr.routes');
const cabRoutes = require('../modules/cab/cab.routes');
const hotelRoutes = require('../modules/hotel/hotel.routes');
const qrRoutes = require('../modules/qr/qr.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const voiceRoutes = require('../modules/voice/voice.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'EventPilot AI backend is healthy'
  });
});

router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/guests', guestRoutes);
router.use('/call', callRoutes);
router.use('/ivr', ivrRoutes);
router.use('/cabs', cabRoutes);
router.use('/hotels', hotelRoutes);
router.use('/checkin', qrRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/voice', voiceRoutes);

module.exports = router;
