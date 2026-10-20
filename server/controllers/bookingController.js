const crypto = require('crypto');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const OTP = require('../models/OTP');
const { sendBookingEmail, sendOTPEmail } = require('../utils/email');

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

exports.sendBookingOTP = async (req, res) => {
    try {
        const otp = generateOTP();
        await OTP.findOneAndDelete({ email: req.user.email, action: 'event_booking' });
        await OTP.create({ email: req.user.email, otp, action: 'event_booking' });
        await sendOTPEmail(req.user.email, otp, 'event_booking');
        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        const emailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
        const status = process.env.NODE_ENV === 'production' && !emailConfigured ? 503 : 502;
        res.status(status).json({
            message: status === 503
                ? 'Booking verification email is not configured on the server. Please contact the project administrator.'
                : 'Could not send the booking OTP. Please try again later.'
        });
    }
};

exports.bookEvent = async (req, res) => {
    try {
        const { eventId, otp } = req.body;
        const isDemoBooking = process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production' && req.user.email === 'user@eventpulse.com' && req.user.role === 'user';

        if (!eventId || (!otp && !isDemoBooking)) {
            return res.status(400).json({ message: 'Event ID and OTP are required' });
        }

        // OTP may only be skipped for the explicitly configured demo account.
        let validOTP = null;
        if (!isDemoBooking) {
            validOTP = await OTP.findOne({ email: req.user.email, otp, action: 'event_booking' });
            if (!validOTP) {
                return res.status(400).json({ message: 'Invalid or expired OTP for booking' });
            }
        }

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if (event.availableSeats <= 0) return res.status(400).json({ message: 'No seats available for this event' });

        // Check for existing active/pending booking
        const existingBooking = await Booking.findOne({ 
            userId: req.user.id, 
            eventId, 
            status: { $ne: 'cancelled' } 
        });
        if (existingBooking) {
            return res.status(400).json({ message: 'You already have an active or pending booking for this event' });
        }

        const booking = await Booking.create({
            userId: req.user.id,
            eventId,
            status: 'pending',
            paymentStatus: 'not_paid',
            amount: event.ticketPrice
        });

        if (validOTP) await OTP.deleteOne({ _id: validOTP._id }); // cleanup OTP

        res.status(201).json({ message: 'Booking request submitted successfully', booking });
    } catch (error) {
        // Handle MongoDB partial unique index violation (duplicate key code 11000)
        if (error.code === 11000) {
            return res.status(400).json({ message: 'You already have an active or pending booking for this event' });
        }
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.confirmBooking = async (req, res) => {
    try {
        const { paymentStatus } = req.body; // 'paid' or 'not_paid'
        const booking = await Booking.findById(req.params.id).populate('userId').populate('eventId');
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        if (booking.status === 'confirmed') {
            return res.status(400).json({ message: 'Booking is already confirmed' });
        }
        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot confirm a cancelled booking' });
        }

        // Step 1: Atomic conditional seat decrement on Event (prevents race conditions)
        const updatedEvent = await Event.findOneAndUpdate(
            { _id: booking.eventId._id, availableSeats: { $gt: 0 } },
            { $inc: { availableSeats: -1 } },
            { new: true }
        );

        if (!updatedEvent) {
            return res.status(400).json({ message: 'No seats available to confirm this booking' });
        }

        // Step 2: Atomic state transition on Booking
        const updatedBooking = await Booking.findOneAndUpdate(
            { _id: booking._id, status: 'pending' },
            { 
                status: 'confirmed',
                ...(paymentStatus ? { paymentStatus } : {})
            },
            { new: true }
        );

        if (!updatedBooking) {
            // Rollback seat decrement if booking was concurrently modified
            await Event.findByIdAndUpdate(booking.eventId._id, { $inc: { availableSeats: 1 } });
            return res.status(400).json({ message: 'Booking status could not be updated (may have been changed)' });
        }

        // Send email on admin confirmation
        if (booking.userId && booking.userId.email) {
            await sendBookingEmail(booking.userId.email, booking.userId.name, booking.eventId.title);
        }

        res.json({ message: 'Booking confirmed successfully', booking: updatedBooking });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.simulateDemoPayment = async (req, res) => {
    try {
        if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production') {
            return res.status(403).json({ message: 'Demo payments are disabled' });
        }
        if (req.user.role !== 'user' || req.user.email !== 'user@eventpulse.com') {
            return res.status(403).json({ message: 'Demo payment is only available to the configured demo user' });
        }

        const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.id }).populate('eventId');
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!booking.eventId) return res.status(404).json({ message: 'The event for this booking no longer exists' });
        if (booking.status === 'confirmed') {
            return res.json({ message: 'Demo booking is already confirmed', booking, demoPayment: Number(booking.amount) > 0, demoFlow: true });
        }
        if (booking.status !== 'pending') {
            return res.status(400).json({ message: 'Only pending bookings can be confirmed' });
        }

        // Demo-only simulation. No payment provider is called and no money is charged.
        const updatedEvent = await Event.findOneAndUpdate(
            { _id: booking.eventId._id, availableSeats: { $gt: 0 } },
            { $inc: { availableSeats: -1 } },
            { new: true }
        );
        if (!updatedEvent) return res.status(400).json({ message: 'No seats available for this event' });

        const updatedBooking = await Booking.findOneAndUpdate(
            { _id: booking._id, status: 'pending' },
            {
                status: 'confirmed',
                // A simulated checkout is not a real payment; never count it as revenue.
                paymentStatus: 'not_paid'
            },
            { new: true }
        );
        if (!updatedBooking) {
            await Event.findByIdAndUpdate(booking.eventId._id, { $inc: { availableSeats: 1 } });
            const latest = await Booking.findById(booking._id);
            if (latest && latest.status === 'confirmed') {
                return res.json({ message: 'Demo booking is already confirmed', booking: latest, demoPayment: Number(latest.amount) > 0, demoFlow: true });
            }
            return res.status(409).json({ message: 'Booking changed during confirmation. Please refresh and check your dashboard.' });
        }

        res.json({
            message: booking.amount > 0
                ? 'Demo checkout completed; no real money was charged. Ticket confirmed for demonstration only.'
                : 'Free registration confirmed for demonstration.',
            booking: updatedBooking,
            demoPayment: Number(booking.amount) > 0,
            demoFlow: true
        });
    } catch (error) {
        if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid booking ID' });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getMyBookings = async (req, res) => {
    try {
        const bookings = req.user.role === 'admin'
            ? await Booking.find().populate('eventId').populate('userId', 'name email').sort({ createdAt: -1 })
            : await Booking.find({ userId: req.user.id }).populate('eventId').sort({ createdAt: -1 });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        const query = { _id: req.params.id };
        if (req.user.role !== 'admin') {
            query.userId = req.user.id;
        }

        const booking = await Booking.findOne(query);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found or not authorized' });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'Booking is already cancelled' });
        }

        const wasConfirmed = booking.status === 'confirmed';

        // Atomic update to cancelled
        const updatedBooking = await Booking.findOneAndUpdate(
            { _id: booking._id, status: { $ne: 'cancelled' } },
            { status: 'cancelled' },
            { new: true }
        );

        if (!updatedBooking) {
            return res.status(400).json({ message: 'Booking was already cancelled' });
        }

        // Atomically restore available seat only if booking was previously confirmed
        if (wasConfirmed) {
            await Event.findByIdAndUpdate(
                booking.eventId,
                { $inc: { availableSeats: 1 } }
            );
        }

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
