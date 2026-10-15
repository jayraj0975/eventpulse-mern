const express = require('express');
const router = express.Router();
const {
    getBookingStatusSummary,
    getEventSummary,
    getEventPopularity,
    getOverviewKPIs
} = require('../controllers/analyticsController');
const { protect, admin } = require('../middleware/auth');

// All analytics endpoints require authenticated Admin role
router.get('/overview', protect, admin, getOverviewKPIs);
router.get('/booking-status', protect, admin, getBookingStatusSummary);
router.get('/event-summary', protect, admin, getEventSummary);
router.get('/event-popularity', protect, admin, getEventPopularity);

module.exports = router;
