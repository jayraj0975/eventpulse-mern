const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');

function getTestMongoUri() {
    const rawUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventpulse_disposable_test';
    
    // Strict safeguard: Never allow tests to run against production databases
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SAFETY BLOCK: Refusing to run integration tests when NODE_ENV is set to production!');
    }
    
    if (rawUri.includes('railway') || rawUri.includes('prod') || rawUri.includes('atlas')) {
        throw new Error('SAFETY BLOCK: Test URI appears to point to an external or production database! Tests must run on a local disposable database.');
    }

    try {
        const parsed = new URL(rawUri);
        const path = parsed.pathname.replace(/^\//, '');
        if (!path || path === 'eventora' || !path.includes('test')) {
            parsed.pathname = '/eventpulse_disposable_test';
            return parsed.toString();
        }
    } catch (e) {
        // Fallback for simple mongodb:// URIs
        if (!rawUri.includes('test')) {
            return 'mongodb://127.0.0.1:27017/eventpulse_disposable_test';
        }
    }

    return rawUri;
}

async function setupTestDatabase() {
    const uri = getTestMongoUri();
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
        console.log(`✅ Connected to disposable test database: ${mongoose.connection.name}`);
    }

    // Synchronize schema indexes
    await Promise.all([
        User.syncIndexes(),
        Event.syncIndexes(),
        Booking.syncIndexes()
    ]);

    // Check if test fixtures are populated
    const userCount = await User.countDocuments();
    if (userCount === 0) {
        console.log('🌱 Seeding fresh fixtures into disposable test database...');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = bcrypt.hashSync('password123', salt);

        const admin = await User.create({
            name: 'Admin User',
            email: 'admin@eventpulse.com',
            password: passwordHash,
            role: 'admin',
            isVerified: true
        });

        const demoUser = await User.create({
            name: 'Demo User',
            email: 'user@eventpulse.com',
            password: passwordHash,
            role: 'user',
            isVerified: true
        });

        const alice = await User.create({
            name: 'Alice Smith',
            email: 'alice@eventpulse.com',
            password: passwordHash,
            role: 'user',
            isVerified: true
        });

        // Seed 6 events
        const createdEvents = await Event.insertMany([
            {
                title: 'React & Node.js Developer Retreat',
                description: 'Full stack development retreat.',
                date: new Date(Date.now() + 10 * 86400000),
                location: 'Silicon Valley, CA',
                category: 'Technology',
                totalSeats: 200,
                availableSeats: 200,
                ticketPrice: 0,
                createdBy: admin._id
            },
            {
                title: 'Neon Nights EDM Festival',
                description: 'EDM and light shows.',
                date: new Date(Date.now() + 20 * 86400000),
                location: 'Grand Arena, NY',
                category: 'Music',
                totalSeats: 500,
                availableSeats: 500,
                ticketPrice: 1500,
                createdBy: admin._id
            },
            {
                title: 'Global Leaders Business Summit',
                description: 'Founders and investors gathering.',
                date: new Date(Date.now() + 15 * 86400000),
                location: 'London, UK',
                category: 'Business',
                totalSeats: 150,
                availableSeats: 150,
                ticketPrice: 5000,
                createdBy: admin._id
            },
            {
                title: 'Modern Art Expo 2024',
                description: 'Contemporary artwork exhibition.',
                date: new Date(Date.now() + 5 * 86400000),
                location: 'Downtown Art Museum',
                category: 'Art',
                totalSeats: 300,
                availableSeats: 300,
                ticketPrice: 200,
                createdBy: admin._id
            }
        ]);

        // Seed some bookings for analytics tests
        await Booking.insertMany([
            { userId: demoUser._id, eventId: createdEvents[3]._id, status: 'confirmed', paymentStatus: 'paid', amount: 200 },
            { userId: alice._id, eventId: createdEvents[3]._id, status: 'confirmed', paymentStatus: 'paid', amount: 200 },
            { userId: alice._id, eventId: createdEvents[1]._id, status: 'confirmed', paymentStatus: 'paid', amount: 1500 },
            { userId: demoUser._id, eventId: createdEvents[1]._id, status: 'pending', paymentStatus: 'not_paid', amount: 1500 },
            { userId: alice._id, eventId: createdEvents[2]._id, status: 'cancelled', paymentStatus: 'not_paid', amount: 5000 }
        ]);

        console.log('✅ Disposable test database seeded with test fixtures.');
    }
}

async function teardownTestDatabase() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
}

module.exports = {
    getTestMongoUri,
    setupTestDatabase,
    teardownTestDatabase
};
