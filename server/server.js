const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

// Required secrets/configuration: never fall back to a known JWT secret or localhost DB.
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required.');
    process.exit(1);
}
if (!process.env.MONGO_URI) {
    console.error('FATAL: MONGO_URI environment variable is required.');
    process.exit(1);
}

const User = require('./models/User');
const Event = require('./models/Event');
const Booking = require('./models/Booking');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const corsOptions = {
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        const stableOrigin = origin === 'https://eventpulse-mern.vercel.app';
        let previewOrigin = false;
        try {
            const host = new URL(origin).hostname;
            previewOrigin = host.endsWith('.vercel.app') && /^eventpulse-mern-[a-z0-9-]+$/.test(host.slice(0, -'.vercel.app'.length));
        } catch {}
        const localOrigin = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        callback(null, stableOrigin || previewOrigin || localOrigin);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Disable x-powered-by to prevent fingerprinting
app.disable('x-powered-by');

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Dedicated Health endpoints
app.get('/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
        status: 'ok',
        uptime: process.uptime(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});
app.get('/api/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
        status: 'ok',
        uptime: process.uptime(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/analytics', analyticsRoutes);

// Catch-all 404 for unknown API routes
app.all('/api/*', (req, res) => {
    res.status(404).json({ message: 'API route not found' });
});

// Central error handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err.message);
    res.status(500).json({ message: 'Internal Server Error' });
});

// Database Connection & Safe Index Sync
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB Connected');
        try {
            await Promise.all([
                User.createIndexes(),
                Event.createIndexes(),
                Booking.createIndexes()
            ]);
            console.log('Database indexes synchronized');
        } catch (idxErr) {
            console.warn('Index sync warning:', idxErr.message);
        }
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    });
