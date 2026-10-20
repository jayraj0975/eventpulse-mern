const crypto = require('crypto');
const User = require('../models/User');
const OTP = require('../models/OTP');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/email');

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'user', // Hardcoded to prevent frontend passing role
            isVerified: false
        });

        const otp = generateOTP();
        await OTP.create({ email, otp, action: 'account_verification' });
        await sendOTPEmail(email, otp, 'account_verification');

        const isDevNoEmail = process.env.NODE_ENV !== 'production' && !process.env.EMAIL_USER;
        const message = isDevNoEmail
            ? 'Account created! (Demo mode: Use OTP 123456 or the code shown in server logs)'
            : 'OTP sent to email. Please verify.';

        res.status(201).json({
            message,
            email: user.email,
            demoOtp: isDevNoEmail ? otp : undefined
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const isConfiguredDemoUser = process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production' && user.email === 'user@eventpulse.com' && user.role === 'user';
        if (isConfiguredDemoUser && !user.isVerified) {
            user.isVerified = true;
            await user.save();
        }

        if (!user.isVerified && user.role !== 'admin') {
            const otp = generateOTP();
            await OTP.findOneAndDelete({ email: user.email, action: 'account_verification' });
            await OTP.create({ email: user.email, otp, action: 'account_verification' });
            await sendOTPEmail(user.email, otp, 'account_verification');
            return res.status(403).json({
                message: !process.env.EMAIL_USER
                    ? 'Account not verified. Check the local server output for the verification code.'
                    : 'Account not verified. A new OTP has been sent to your email.',
                needsVerification: true,
                email: user.email
            });
        }

        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user.id, user.role)
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const isDemoBypass = process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production' && !process.env.EMAIL_USER && otp === '123456';
        const validOTP = await OTP.findOne({ email, otp, action: 'account_verification' });

        if (!validOTP && !isDemoBypass) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });
        if (validOTP) {
            await OTP.deleteOne({ _id: validOTP._id });
        }

        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user.id, user.role)
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};
