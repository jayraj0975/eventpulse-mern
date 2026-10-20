const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const requireTestMongoUri = require('./require-test-mongo-uri');

const authRoutes = require('../routes/auth');
const eventRoutes = require('../routes/events');
const bookingRoutes = require('../routes/bookings');
const analyticsRoutes = require('../routes/analytics');

async function runApiSmokeTest() {
    console.log('====================================================');
    console.log('TEST SUITE: API Route & Health Smoke Verification');
    console.log('====================================================\n');

    await mongoose.connect(requireTestMongoUri());

    const app = express();
    app.disable('x-powered-by');
    app.use(cors());
    app.use(express.json());

    // Security headers middleware
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });

    app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
    app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

    app.use('/api/auth', authRoutes);
    app.use('/api/events', eventRoutes);
    app.use('/api/bookings', bookingRoutes);
    app.use('/api/analytics', analyticsRoutes);

    app.all('/api/*', (req, res) => res.status(404).json({ message: 'API route not found' }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    console.log(`Test HTTP server listening on ${base}`);

    try {
        // 1. Health check
        const healthRes = await fetch(`${base}/health`);
        const healthData = await healthRes.json();
        if (healthRes.status === 200 && healthData.status === 'ok') {
            console.log('✅ PASS: GET /health returns 200 OK');
        } else {
            throw new Error(`GET /health failed with status ${healthRes.status}`);
        }

        // 2. API Health check
        const apiHealthRes = await fetch(`${base}/api/health`);
        const apiHealthData = await apiHealthRes.json();
        if (apiHealthRes.status === 200 && apiHealthData.status === 'ok') {
            console.log('✅ PASS: GET /api/health returns 200 OK');
        } else {
            throw new Error(`GET /api/health failed with status ${apiHealthRes.status}`);
        }

        // 3. Events listing
        const eventsRes = await fetch(`${base}/api/events`);
        const eventsData = await eventsRes.json();
        if (eventsRes.status === 200 && Array.isArray(eventsData)) {
            console.log(`✅ PASS: GET /api/events returns 200 OK (${eventsData.length} events found)`);
        } else {
            throw new Error(`GET /api/events failed with status ${eventsRes.status}`);
        }

        // 4. Auth validation with invalid password
        const authRes = await fetch(`${base}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'user@eventpulse.com', password: 'wrongpassword' })
        });
        const authData = await authRes.json();
        if (authRes.status === 400 && authData.message === 'Invalid credentials') {
            console.log('✅ PASS: POST /api/auth/login rejects incorrect credentials with 400');
        } else {
            throw new Error(`POST /api/auth/login did not reject bad credentials properly: ${authRes.status}`);
        }

        // 5. Unknown API route returns 404
        const notFoundRes = await fetch(`${base}/api/unknown-route-check`);
        if (notFoundRes.status === 404) {
            console.log('✅ PASS: Catch-all 404 handler returns 404 for unknown route');
        } else {
            throw new Error(`Unknown route returned status ${notFoundRes.status}`);
        }

        console.log('\n====================================================');
        console.log('ALL API SMOKE TESTS PASSED (100%)');
        console.log('====================================================\n');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        await mongoose.disconnect();
    }
}

runApiSmokeTest().then(() => process.exit(0)).catch((err) => {
    console.error('❌ API smoke test failed:', err);
    process.exit(1);
});
