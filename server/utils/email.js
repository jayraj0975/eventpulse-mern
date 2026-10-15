const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: userEmail,
            subject: `Booking Confirmed: ${eventTitle}`,
            html: `
        <h2>Hi ${userName}!</h2>
        <p>Your booking for the event <strong>${eventTitle}</strong> is successfully confirmed.</p>
        <p>Thank you for choosing Eventora.</p>
      `
        };
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await transporter.sendMail(mailOptions);
            console.log('📧 Booking confirmation email sent successfully to', userEmail);
        } else {
            console.log(`ℹ️ [Email Skipped] Booking confirmation email for ${userEmail} (${eventTitle}) logged in dev mode.`);
        }
    } catch (error) {
        console.error('Error sending email:', error.message);
    }
};

const sendOTPEmail = async (userEmail, otp, type) => {
    try {
        const title = type === 'account_verification' ? 'Verify your Eventora Account' : 'Eventora Booking Verification';
        const msg = type === 'account_verification'
            ? 'Please use the following OTP to verify your new Eventora account.'
            : 'Please use the following OTP to verify and confirm your event booking.';

        const mailOptions = {
            from: process.env.EMAIL_USER,
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
        console.log(`\n========================================\n🔑 [EVENTORA OTP] To: ${userEmail}\n   Action: ${type}\n   Code:   ${otp}\n========================================\n`);
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await transporter.sendMail(mailOptions);
            console.log(`📧 OTP email sent to ${userEmail} for ${type}`);
        } else {
            console.log(`ℹ️ [Email Skipped] EMAIL_USER/EMAIL_PASS not configured. Using console OTP above.`);
        }
    } catch (error) {
        console.error('Error sending OTP email:', error.message);
    }
};

module.exports = { sendBookingEmail, sendOTPEmail };
