const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: [true, 'Event ID is required'] },
    status: { 
        type: String, 
        enum: {
            values: ['confirmed', 'cancelled', 'pending'],
            message: '{VALUE} is not a valid booking status'
        }, 
        default: 'pending' 
    },
    paymentStatus: { 
        type: String, 
        enum: {
            values: ['paid', 'not_paid'],
            message: '{VALUE} is not a valid payment status'
        }, 
        default: 'not_paid' 
    },
    amount: { type: Number, required: [true, 'Amount is required'], min: [0, 'Amount cannot be negative'] },
    bookedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound index for event bookings and status lookups
bookingSchema.index({ eventId: 1, status: 1 });

// Compound index for user booking history sorted chronologically
bookingSchema.index({ userId: 1, createdAt: -1 });

// Single-field index for admin status queries and aggregation pipelines
bookingSchema.index({ status: 1 });

// Database integrity: Partial unique indexes prevent duplicate pending or confirmed bookings
bookingSchema.index(
    { userId: 1, eventId: 1 },
    { 
        unique: true, 
        partialFilterExpression: { status: 'confirmed' },
        name: 'unique_confirmed_user_event'
    }
);

bookingSchema.index(
    { userId: 1, eventId: 1 },
    { 
        unique: true, 
        partialFilterExpression: { status: 'pending' },
        name: 'unique_pending_user_event'
    }
);

module.exports = mongoose.model('Booking', bookingSchema);
