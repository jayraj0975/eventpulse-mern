const nodemailer = require('nodemailer');
const escapeHtml = (value = '') => String(value).replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);
const dotenv = require('dotenv');

dotenv.config();

const transporter = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    })
    : nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

const isDemoOrInternalEmail = (email = '') => {
    const clean = String(email || '').trim().toLowerCase();
    const domain = clean.split('@')[1];
    return !domain || domain === 'eventpulse.com' || domain === 'example.com' || domain === 'test.com' || domain === 'localhost';
};

const deliverMailWithTimeout = (mailOptions, timeoutMs = 2500) => {
    return Promise.race([
        transporter.sendMail(mailOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Email delivery timed out')), timeoutMs))
    ]);
};

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    try {
        if (isDemoOrInternalEmail(userEmail)) {
            console.log(`ℹ️ [Demo Account] Booking confirmation for ${userEmail} (${escapeHtml(eventTitle)}) logged in console.`);
            return;
        }

        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply@eventpulse.com',
            to: userEmail,
            subject: `Booking Confirmed: ${escapeHtml(eventTitle)}`,
            html: `
        <h2>Hi ${escapeHtml(userName)}!</h2>
        <p>Your booking for the event <strong>${escapeHtml(eventTitle)}</strong> is successfully confirmed.</p>
        <p>Thank you for choosing EventPulse.</p>
      `
        };

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await deliverMailWithTimeout(mailOptions, 2500);
            console.log('📧 Booking confirmation email sent successfully to', userEmail);
        } else {
            console.log(`ℹ️ [Email Skipped] Booking confirmation email for ${userEmail} (${escapeHtml(eventTitle)}) logged in dev mode.`);
        }
    } catch (error) {
        console.warn('Outbound booking confirmation email skipped:', error.message);
    }
};

const sendOTPEmail = async (userEmail, otp, type) => {
    try {
        console.log(`\n========================================\n🔑 [EVENTPULSE OTP] To: ${userEmail}\n   Action: ${type}\n   Code:   ${otp}\n========================================\n`);

        if (isDemoOrInternalEmail(userEmail)) {
            console.log(`ℹ️ [Demo Account] Skipping SMTP network delivery for ${userEmail}. Using code: ${otp}`);
            return { delivered: false, demoOtp: otp, isDemo: true };
        }

        const title = type === 'account_verification' ? 'Verify your EventPulse Account' : 'EventPulse Booking Verification';
        const msg = type === 'account_verification'
            ? 'Please use the following OTP to verify your new EventPulse account.'
            : 'Please use the following OTP to verify and confirm your event booking.';

        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply@eventpulse.com',
            to: userEmail,
            subject: title,
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #111;">${title}</h2>
                    <p style="color: #555; font-size: 16px;">${msg}</p>
                    <div style="margin: 20px auto; padding: 15px; font-size: 24px; font-weight: bold; background: #f4f4f4; width: max-content; letter-spacing: 5px;">
                        ${otp}
                    </div>
                    <p style="color: #999; font-size: 12px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
                </div>
            `
        };

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                await deliverMailWithTimeout(mailOptions, 2500);
                console.log(`📧 OTP email sent to ${userEmail} for ${type}`);
                return { delivered: true };
            } catch (err) {
                console.warn(`⚠️ Outbound email skipped for ${userEmail} (${err.message}). Using code: ${otp}`);
                return { delivered: false, demoOtp: otp, error: err.message };
            }
        } else {
            console.log(`ℹ️ [Email Skipped] EMAIL_USER/EMAIL_PASS not configured. Demo code: ${otp}`);
            return { delivered: false, demoOtp: otp };
        }
    } catch (error) {
        console.error('Error in sendOTPEmail:', error.message);
        return { delivered: false, demoOtp: otp, error: error.message };
    }
};

module.exports = { sendBookingEmail, sendOTPEmail };
