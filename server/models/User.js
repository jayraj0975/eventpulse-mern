const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'] },
    password: { type: String, required: [true, 'Password is required'] },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isVerified: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
