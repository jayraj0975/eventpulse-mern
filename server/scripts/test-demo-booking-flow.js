const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
dotenv.config();

const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const OTP = require('../models/OTP');
const { login } = require('../controllers/authController');
const { bookEvent, sendBookingOTP, simulateDemoPayment, cancelBooking } = require('../controllers/bookingController');
const { getOverviewKPIs } = require('../controllers/analyticsController');

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

async function runDemoTestSuite() {
    try {
        await mongoose.connect(require('./require-test-mongo-uri')());
        console.log('Connected to MongoDB for Demo Booking Flow Verification\n');

        // Ensure baseline demo settings
        process.env.DEMO_MODE = 'true';
        process.env.NODE_ENV = 'development';
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_eventora_college_2026';

        // 1. Fetch test users and events
        const demoUser = await User.findOne({ email: 'user@eventpulse.com' });
        const normalUser = await User.findOne({ email: 'alice@eventpulse.com' });
        const paidEvent = await Event.findOne({ ticketPrice: { $gt: 0 }, availableSeats: { $gt: 5 } });
        const freeEvent = await Event.findOne({ ticketPrice: 0, availableSeats: { $gt: 5 } });

        if (!demoUser || !normalUser || !paidEvent || !freeEvent) {
            throw new Error('Required seed data missing. Run seed.js first.');
        }

        console.log('====================================================');
        console.log('TEST 1: Demo Login & Production Guardrails');
        console.log('====================================================');

        // 1.1 Demo login in development mode
        await User.updateOne({ email: 'user@eventpulse.com' }, { $set: { isVerified: false } });

        const loginReq = { body: { email: 'user@eventpulse.com', password: 'password123' } };
        const loginRes = createMockRes();
        await login(loginReq, loginRes);

        if (loginRes.statusCode === 200 && loginRes.data.token && loginRes.data.email === 'user@eventpulse.com') {
            console.log('✅ PASS: 1.1 Demo login auto-verifies and issues token in dev demo mode');
        } else {
            throw new Error(`Demo login failed: status ${loginRes.statusCode}, msg: ${loginRes.data?.message}`);
        }

        // 1.2 Normal user login requires OTP
        normalUser.isVerified = false;
        await normalUser.save();

        const normalLoginReq = { body: { email: 'alice@eventpulse.com', password: 'password123' } };
        const normalLoginRes = createMockRes();
        await login(normalLoginReq, normalLoginRes);

        if (normalLoginRes.statusCode === 403 && normalLoginRes.data.needsVerification) {
            console.log('✅ PASS: 1.2 Normal user cannot bypass account verification');
        } else {
            throw new Error('Normal user bypassed verification!');
        }

        // 1.3 Production safeguard: Demo login disabled when NODE_ENV=production
        process.env.NODE_ENV = 'production';
        await User.updateOne({ email: 'user@eventpulse.com' }, { $set: { isVerified: false } });

        const prodLoginReq = { body: { email: 'user@eventpulse.com', password: 'password123' } };
        const prodLoginRes = createMockRes();
        await login(prodLoginReq, prodLoginRes);

        if ((prodLoginRes.statusCode === 403 && prodLoginRes.data.needsVerification) || prodLoginRes.statusCode === 503) {
            console.log('✅ PASS: 1.3 Production safeguard: Demo login blocked when NODE_ENV=production');
        } else {
            throw new Error('Demo login allowed in production mode!');
        }

        // Restore dev demo mode for booking tests
        process.env.NODE_ENV = 'development';
        await User.updateOne({ email: 'user@eventpulse.com' }, { $set: { isVerified: true } });

        console.log('\n====================================================');
        console.log('TEST 2: Demo Booking Creation (No OTP for Demo User)');
        console.log('====================================================');

        // Clean any existing bookings for demo user on test events
        await Booking.deleteMany({ userId: demoUser._id, eventId: { $in: [paidEvent._id, freeEvent._id] } });

        // 2.1 Demo user can book without OTP
        const bookReq1 = {
            user: { id: demoUser._id.toString(), email: demoUser.email, role: demoUser.role },
            body: { eventId: paidEvent._id.toString() }
        };
        const bookRes1 = createMockRes();
        await bookEvent(bookReq1, bookRes1);

        if (bookRes1.statusCode === 201 && bookRes1.data.booking.status === 'pending') {
            console.log('✅ PASS: 2.1 Demo user created booking without OTP in demo mode');
        } else {
            throw new Error(`Demo booking failed: status ${bookRes1.statusCode}, msg: ${bookRes1.data?.message}`);
        }
        const createdPaidBooking = bookRes1.data.booking;

        // 2.2 Normal user CANNOT book without OTP
        const normalBookReq = {
            user: { id: normalUser._id.toString(), email: normalUser.email, role: normalUser.role },
            body: { eventId: paidEvent._id.toString() }
        };
        const normalBookRes = createMockRes();
        await bookEvent(normalBookReq, normalBookRes);

        if (normalBookRes.statusCode === 400 && normalBookRes.data.message.includes('OTP')) {
            console.log('✅ PASS: 2.2 Normal user cannot book without OTP');
        } else {
            throw new Error('Normal user was able to book without OTP!');
        }

        // 2.3 Production safeguard: Demo user CANNOT book without OTP in production
        process.env.NODE_ENV = 'production';
        const prodBookReq = {
            user: { id: demoUser._id.toString(), email: demoUser.email, role: demoUser.role },
            body: { eventId: freeEvent._id.toString() }
        };
        const prodBookRes = createMockRes();
        await bookEvent(prodBookReq, prodBookRes);

        if (prodBookRes.statusCode === 400 && prodBookRes.data.message.includes('OTP')) {
            console.log('✅ PASS: 2.3 Production safeguard: Demo booking without OTP blocked in production');
        } else {
            throw new Error('Demo booking without OTP allowed in production!');
        }
        process.env.NODE_ENV = 'development';

        console.log('\n====================================================');
        console.log('TEST 3: Simulated Demo Checkout & Seat Integrity');
        console.log('====================================================');

        const initialSeats = (await Event.findById(paidEvent._id)).availableSeats;

        // 3.1 Normal user cannot execute demo payment
        const normalPayReq = {
            user: { id: normalUser._id.toString(), email: normalUser.email, role: normalUser.role },
            params: { id: createdPaidBooking._id.toString() }
        };
        const normalPayRes = createMockRes();
        await simulateDemoPayment(normalPayReq, normalPayRes);

        if (normalPayRes.statusCode === 403) {
            console.log('✅ PASS: 3.1 Non-demo user blocked from simulated demo payment endpoint');
        } else {
            throw new Error('Normal user executed simulated payment!');
        }

        // 3.2 Production safeguard: Demo payment blocked when NODE_ENV=production
        process.env.NODE_ENV = 'production';
        const demoProdPayReq = {
            user: { id: demoUser._id.toString(), email: demoUser.email, role: demoUser.role },
            params: { id: createdPaidBooking._id.toString() }
        };
        const demoProdPayRes = createMockRes();
        await simulateDemoPayment(demoProdPayReq, demoProdPayRes);

        if (demoProdPayRes.statusCode === 403) {
            console.log('✅ PASS: 3.2 Production safeguard: Simulated checkout blocked when NODE_ENV=production');
        } else {
            throw new Error('Simulated payment allowed in production!');
        }
        process.env.NODE_ENV = 'development';

        // 3.3 Successful simulated paid checkout for demo user
        const demoPayReq = {
            user: { id: demoUser._id.toString(), email: demoUser.email, role: demoUser.role },
            params: { id: createdPaidBooking._id.toString() }
        };
        const demoPayRes = createMockRes();
        await simulateDemoPayment(demoPayReq, demoPayRes);

        if (
            demoPayRes.statusCode === 200 &&
            demoPayRes.data.booking.status === 'confirmed' &&
            demoPayRes.data.booking.paymentStatus === 'not_paid' &&
            demoPayRes.data.demoPayment === true
        ) {
            console.log('✅ PASS: 3.3 Paid event simulated checkout confirmed booking with paymentStatus="not_paid"');
        } else {
            throw new Error(`Simulated payment failed: status ${demoPayRes.statusCode}, msg: ${demoPayRes.data?.message}`);
        }

        const seatsAfterPaidConfirm = (await Event.findById(paidEvent._id)).availableSeats;
        if (seatsAfterPaidConfirm === initialSeats - 1) {
            console.log('✅ PASS: 3.4 Available seats decremented by exactly 1');
        } else {
            throw new Error(`Seat count mismatch: expected ${initialSeats - 1}, got ${seatsAfterPaidConfirm}`);
        }

        // 3.5 Idempotency: repeated checkout attempt does not double-decrement seats
        const repeatPayRes = createMockRes();
        await simulateDemoPayment(demoPayReq, repeatPayRes);
        const seatsAfterRepeat = (await Event.findById(paidEvent._id)).availableSeats;

        if (repeatPayRes.statusCode === 200 && seatsAfterRepeat === initialSeats - 1) {
            console.log('✅ PASS: 3.5 Idempotent repeated checkout prevented duplicate seat decrement');
        } else {
            throw new Error('Repeated checkout double-decremented seats!');
        }

        // 3.6 Free event simulated checkout test
        const freeBookReq = {
            user: { id: demoUser._id.toString(), email: demoUser.email, role: demoUser.role },
            body: { eventId: freeEvent._id.toString() }
        };
        const freeBookRes = createMockRes();
        await bookEvent(freeBookReq, freeBookRes);
        const createdFreeBooking = freeBookRes.data.booking;

        const freePayReq = {
            user: { id: demoUser._id.toString(), email: demoUser.email, role: demoUser.role },
            params: { id: createdFreeBooking._id.toString() }
        };
        const freePayRes = createMockRes();
        await simulateDemoPayment(freePayReq, freePayRes);

        if (
            freePayRes.statusCode === 200 &&
            freePayRes.data.booking.status === 'confirmed' &&
            freePayRes.data.demoPayment === false
        ) {
            console.log('✅ PASS: 3.6 Free registration confirmed with demoPayment=false');
        } else {
            throw new Error('Free registration simulated checkout failed');
        }

        console.log('\n====================================================');
        console.log('TEST 4: Revenue & Analytics Safeguard');
        console.log('====================================================');

        // Check overview KPIs: verified revenue must NOT count the simulated checkout!
        const kpiRes = createMockRes();
        await getOverviewKPIs({}, kpiRes);

        // Fetch direct check from DB: all bookings with paymentStatus 'paid'
        const rawPaidRevenue = await Booking.aggregate([
            { $match: { status: 'confirmed', paymentStatus: 'paid' } },
            { $group: { _id: null, sum: { $sum: '$amount' } } }
        ]);
        const expectedRevenue = rawPaidRevenue[0]?.sum || 0;

        if (kpiRes.data.kpis.totalRevenue === expectedRevenue) {
            console.log(`✅ PASS: 4.1 Total revenue (${kpiRes.data.kpis.totalRevenue}) strictly excludes simulated demo checkouts`);
        } else {
            throw new Error('Simulated checkout leaked into total revenue!');
        }

        console.log('\n====================================================');
        console.log('TEST 5: Cancellation & Seat Restoration');
        console.log('====================================================');

        // Cancel the confirmed paid booking
        const cancelReq = {
            user: { id: demoUser._id.toString(), email: demoUser.email, role: demoUser.role },
            params: { id: createdPaidBooking._id.toString() }
        };
        const cancelRes = createMockRes();
        await cancelBooking(cancelReq, cancelRes);

        const seatsAfterCancel = (await Event.findById(paidEvent._id)).availableSeats;
        if (cancelRes.statusCode === 200 && seatsAfterCancel === initialSeats) {
            console.log('✅ PASS: 5.1 Cancellation restored seat count to initial value');
        } else {
            throw new Error(`Cancellation seat restoration failed: expected ${initialSeats}, got ${seatsAfterCancel}`);
        }

        // Duplicate cancellation attempt
        const doubleCancelRes = createMockRes();
        await cancelBooking(cancelReq, doubleCancelRes);
        const seatsAfterDouble = (await Event.findById(paidEvent._id)).availableSeats;

        if (doubleCancelRes.statusCode === 400 && seatsAfterDouble === initialSeats) {
            console.log('✅ PASS: 5.2 Duplicate cancellation safely rejected without inflating seats');
        } else {
            throw new Error('Double cancellation inflated seat count!');
        }

        console.log('\n====================================================');
        console.log('TEST 6: Production OTP Verification and Error Actionability');
        console.log('====================================================');

        // 6.1 sendBookingOTP when email delivery is not configured returns demoOtp gracefully
        const originalEmailUser = process.env.EMAIL_USER;
        const originalEmailPass = process.env.EMAIL_PASS;
        delete process.env.EMAIL_USER;
        delete process.env.EMAIL_PASS;

        const otpReqProd = {
            user: { id: normalUser._id.toString(), email: normalUser.email, role: normalUser.role }
        };
        const otpResProd = createMockRes();
        await sendBookingOTP(otpReqProd, otpResProd);

        if (otpResProd.statusCode === 200 && otpResProd.data?.demoOtp) {
            console.log('✅ PASS: 6.1 Booking OTP returns demoOtp fallback when email delivery is not configured');
        } else {
            throw new Error(`Expected 200 with demoOtp, got status ${otpResProd.statusCode}: ${JSON.stringify(otpResProd.data)}`);
        }

        // Restore dev environment for OTP generation
        process.env.NODE_ENV = 'development';
        if (originalEmailUser) process.env.EMAIL_USER = originalEmailUser;
        if (originalEmailPass) process.env.EMAIL_PASS = originalEmailPass;

        // 6.2 sendBookingOTP in dev creates OTP in database
        const otpResDev = createMockRes();
        await sendBookingOTP(otpReqProd, otpResDev);

        const createdOtpDoc = await OTP.findOne({ email: normalUser.email, action: 'event_booking' });
        if (otpResDev.statusCode === 200 && createdOtpDoc && createdOtpDoc.otp) {
            console.log('✅ PASS: 6.2 Booking OTP created in database and sent successfully in development');
        } else {
            throw new Error('Failed to create booking OTP record in database');
        }

        // 6.3 bookEvent with invalid OTP fails with 400
        await Booking.deleteMany({ userId: normalUser._id, eventId: paidEvent._id });
        const invalidOtpReq = {
            user: { id: normalUser._id.toString(), email: normalUser.email, role: normalUser.role },
            body: { eventId: paidEvent._id.toString(), otp: '000000' }
        };
        const invalidOtpRes = createMockRes();
        await bookEvent(invalidOtpReq, invalidOtpRes);

        if (invalidOtpRes.statusCode === 400 && invalidOtpRes.data.message.includes('Invalid or expired OTP')) {
            console.log('✅ PASS: 6.3 Booking with incorrect OTP rejected with 400');
        } else {
            throw new Error(`Expected 400, got ${invalidOtpRes.statusCode}`);
        }

        // 6.4 bookEvent with valid OTP succeeds and deletes OTP
        const validOtpReq = {
            user: { id: normalUser._id.toString(), email: normalUser.email, role: normalUser.role },
            body: { eventId: paidEvent._id.toString(), otp: createdOtpDoc.otp }
        };
        const validOtpRes = createMockRes();
        await bookEvent(validOtpReq, validOtpRes);

        const otpAfterBooking = await OTP.findOne({ email: normalUser.email, action: 'event_booking' });
        if (validOtpRes.statusCode === 201 && validOtpRes.data.booking?.status === 'pending' && !otpAfterBooking) {
            console.log('✅ PASS: 6.4 Booking with valid OTP succeeds and consumes OTP');
        } else {
            throw new Error(`Expected 201 with OTP consumed, got status ${validOtpRes.statusCode}`);
        }

        // Clean up test booking
        await Booking.deleteMany({ userId: normalUser._id, eventId: paidEvent._id });

        console.log('\n====================================================');
        console.log('ALL DEMO FLOW & SECURITY TESTS PASSED (100%)');
        console.log('====================================================\n');
        process.exit(0);
    } catch (err) {
        console.error('❌ Demo test suite failed:', err);
        process.exit(1);
    }
}

runDemoTestSuite();
