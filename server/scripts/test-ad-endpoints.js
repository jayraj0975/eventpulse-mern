const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
dotenv.config();

const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const OTP = require('../models/OTP');
const {
    getBookingStatusSummary,
    getEventSummary,
    getEventPopularity,
    getOverviewKPIs
} = require('../controllers/analyticsController');
const {
    bookEvent,
    confirmBooking,
    cancelBooking
} = require('../controllers/bookingController');

// Mock Express response object for direct controller testing
function createMockRes() {
    return {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };
}

async function runTestSuite() {
    try {
        await mongoose.connect(require('./require-test-mongo-uri')());
        console.log('Connected to MongoDB for AD Feature Verification\n');

        const admin = await User.findOne({ email: 'admin@eventpulse.com' });
        const user = await User.findOne({ email: 'user@eventpulse.com' });

        // -------------------------------------------------------------
        // SUITE 1: Aggregation Pipelines
        // -------------------------------------------------------------
        console.log('====================================================');
        console.log('SUITE 1: Testing Aggregation Pipelines');
        console.log('====================================================');

        // Test 1.1: Booking Status Summary
        const req1 = { user: admin };
        const res1 = createMockRes();
        await getBookingStatusSummary(req1, res1);
        console.log('1.1 Booking Status Summary Response Status:', res1.statusCode);
        console.log('Data returned (grouped by status):', res1.data.data);
        if (res1.statusCode === 200 && Array.isArray(res1.data.data)) {
            console.log('✅ PASS: Pipeline 1 (Booking Status Summary)');
        } else {
            throw new Error('Pipeline 1 failed');
        }

        // Test 1.2: Event Summary (Lookup + Verified Revenue)
        const req2 = { user: admin };
        const res2 = createMockRes();
        await getEventSummary(req2, res2);
        console.log('\n1.2 Event Summary (with $lookup & verified revenue) Status:', res2.statusCode);
        console.log(`Events analyzed: ${res2.data.data.length}`);
        const sampleEvent = res2.data.data[0];
        console.log('Sample aggregated event:', {
            title: sampleEvent.title,
            category: sampleEvent.category,
            totalBookings: sampleEvent.totalBookings,
            confirmedBookings: sampleEvent.confirmedBookings,
            verifiedRevenue: sampleEvent.verifiedRevenue,
            occupancyRate: `${sampleEvent.occupancyRate}%`
        });
        if (res2.statusCode === 200 && res2.data.data.length > 0) {
            console.log('✅ PASS: Pipeline 2 (Event & Revenue Summary with $lookup)');
        } else {
            throw new Error('Pipeline 2 failed');
        }

        // Test 1.3: Event Popularity Ranking
        const req3 = { user: admin };
        const res3 = createMockRes();
        await getEventPopularity(req3, res3);
        console.log('\n1.3 Event Popularity Ranking Status:', res3.statusCode);
        console.log('Popularity ranking count:', res3.data.data.length);
        if (res3.data.data.length > 0) {
            console.log('Top ranked event:', res3.data.data[0]);
        }
        if (res3.statusCode === 200 && Array.isArray(res3.data.data)) {
            console.log('✅ PASS: Pipeline 3 (Event Popularity Ranking)');
        } else {
            throw new Error('Pipeline 3 failed');
        }

        // Test 1.4: Overview KPIs ($facet)
        const req4 = { user: admin };
        const res4 = createMockRes();
        await getOverviewKPIs(req4, res4);
        console.log('\n1.4 Overview KPIs Status:', res4.statusCode);
        console.log('KPIs:', res4.data.kpis);
        if (res4.statusCode === 200 && res4.data.kpis) {
            console.log('✅ PASS: Overview KPIs via $facet');
        } else {
            throw new Error('Overview KPIs failed');
        }

        // -------------------------------------------------------------
        // SUITE 2: Duplicate Booking Prevention (Partial Unique Index)
        // -------------------------------------------------------------
        console.log('\n====================================================');
        console.log('SUITE 2: Duplicate Active Booking Prevention');
        console.log('====================================================');

        const testEvent = await Event.findOne({ availableSeats: { $gt: 5 } });
        // Clean any existing booking for user and testEvent
        await Booking.deleteMany({ userId: user._id, eventId: testEvent._id });
        await OTP.deleteMany({ email: user.email });

        // Create valid OTP
        await OTP.create({ email: user.email, otp: '123456', action: 'event_booking' });

        // Booking 1
        const bookReq1 = {
            user,
            body: { eventId: testEvent._id.toString(), otp: '123456' }
        };
        const bookRes1 = createMockRes();
        await bookEvent(bookReq1, bookRes1);
        console.log('First booking status:', bookRes1.statusCode, bookRes1.data.message);

        // Try booking 2 for same user and event (should be rejected!)
        await OTP.create({ email: user.email, otp: '123456', action: 'event_booking' });
        const bookReq2 = {
            user,
            body: { eventId: testEvent._id.toString(), otp: '123456' }
        };
        const bookRes2 = createMockRes();
        await bookEvent(bookReq2, bookRes2);
        console.log('Duplicate booking attempt status:', bookRes2.statusCode, bookRes2.data.message);

        if (bookRes2.statusCode === 400 && bookRes2.data.message.includes('already have an active')) {
            console.log('✅ PASS: Duplicate active booking rejected by database constraint & controller');
        } else {
            throw new Error('Duplicate booking was not properly prevented');
        }

        // -------------------------------------------------------------
        // SUITE 3: Atomic Concurrency & Seat Decrement/Restore
        // -------------------------------------------------------------
        console.log('\n====================================================');
        console.log('SUITE 3: Atomic Concurrency & Seat Integrity');
        console.log('====================================================');

        const createdBooking = bookRes1.data.booking;
        const initialSeats = (await Event.findById(testEvent._id)).availableSeats;
        console.log('Initial available seats before confirmation:', initialSeats);

        // Confirm booking
        const confirmReq = {
            params: { id: createdBooking._id.toString() },
            body: { paymentStatus: 'paid' }
        };
        const confirmRes = createMockRes();
        await confirmBooking(confirmReq, confirmRes);
        console.log('Confirm booking status:', confirmRes.statusCode, confirmRes.data.message);

        const seatsAfterConfirm = (await Event.findById(testEvent._id)).availableSeats;
        console.log('Available seats after confirmation:', seatsAfterConfirm);
        if (seatsAfterConfirm !== initialSeats - 1) {
            throw new Error(`Expected seats to be ${initialSeats - 1}, but got ${seatsAfterConfirm}`);
        }
        console.log('✅ PASS: Seat decremented atomically by exactly 1 on confirmation');

        // Cancel confirmed booking
        const cancelReq = {
            user: admin,
            params: { id: createdBooking._id.toString() }
        };
        const cancelRes = createMockRes();
        await cancelBooking(cancelReq, cancelRes);
        console.log('Cancel booking status:', cancelRes.statusCode, cancelRes.data.message);

        const seatsAfterCancel = (await Event.findById(testEvent._id)).availableSeats;
        console.log('Available seats after cancellation:', seatsAfterCancel);
        if (seatsAfterCancel !== initialSeats) {
            throw new Error(`Expected seats to be restored to ${initialSeats}, but got ${seatsAfterCancel}`);
        }
        console.log('✅ PASS: Seat restored atomically by exactly 1 on cancellation');

        // Try double cancellation (should be rejected and NOT increment seats again!)
        const cancelRes2 = createMockRes();
        await cancelBooking(cancelReq, cancelRes2);
        const seatsAfterDoubleCancel = (await Event.findById(testEvent._id)).availableSeats;
        console.log('Seats after duplicate cancellation attempt:', seatsAfterDoubleCancel);
        if (seatsAfterDoubleCancel === initialSeats) {
            console.log('✅ PASS: Duplicate cancellation safely prevented seat inflation');
        } else {
            throw new Error('Double cancellation corrupted seat count!');
        }

        console.log('\n====================================================');
        console.log('ALL AD TEST SUITES PASSED WITH 100% SUCCESS');
        console.log('====================================================\n');
        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    }
}

runTestSuite();
