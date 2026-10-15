const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'Event title is required'], trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: [true, 'Description is required'], trim: true },
    date: { type: Date, required: [true, 'Event date is required'] },
    location: { type: String, required: [true, 'Location is required'], trim: true },
    category: { type: String, required: [true, 'Category is required'], trim: true },
    totalSeats: { type: Number, required: [true, 'Total seats is required'], min: [1, 'Total seats must be at least 1'] },
    availableSeats: { type: Number, required: [true, 'Available seats is required'], min: [0, 'Available seats cannot be negative'] },
    image: { type: String, default: '' },
    ticketPrice: { type: Number, required: true, default: 0, min: [0, 'Ticket price cannot be negative'] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

// Compound index for category filtering and date-ordered listing
eventSchema.index({ category: 1, date: 1 });
// Single-field index for temporal sorting and queries
eventSchema.index({ date: 1 });

module.exports = mongoose.model('Event', eventSchema);
