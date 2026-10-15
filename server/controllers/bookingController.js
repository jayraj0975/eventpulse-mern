const Booking = require('../models/Booking');
const Event = require('../models/Event');
const OTP = require('../models/OTP');
const { sendBookingEmail, sendOTPEmail } = require('../utils/email');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.sendBookingOTP = async (req, res) => {
    try {
        const otp = generateOTP();
        await OTP.findOneAndDelete({ email: req.user.email, action: 'event_booking' });
        await OTP.create({ email: req.user.email, otp, action: 'event_booking' });
        await sendOTPEmail(req.user.email, otp, 'event_booking');
        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error sending OTP', error: error.message });
    }
};

exports.bookEvent = async (req, res) => {
    try {
        const { eventId, otp } = req.body;

        if (!eventId || !otp) {
            return res.status(400).json({ message: 'Event ID and OTP are required' });
        }

        // Verify OTP explicitly before proceeding
        const validOTP = await OTP.findOne({ email: req.user.email, otp, action: 'event_booking' });
        if (!validOTP) {
            return res.status(400).json({ message: 'Invalid or expired OTP for booking' });
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

        await OTP.deleteOne({ _id: validOTP._id }); // cleanup OTP

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
