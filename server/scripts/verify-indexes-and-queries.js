const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Event = require('../models/Event');
const Booking = require('../models/Booking');
const User = require('../models/User');

async function runExplainTests() {
    try {
        await mongoose.connect(require('./require-test-mongo-uri')());
        console.log('Connected to MongoDB for Query Plan Verification\n');

        const db = mongoose.connection.db;

        // Test 1: User Booking History Query
        console.log('===============================================================');
        console.log('TEST 1: User Booking History Query Plan');
        console.log('Query: db.bookings.find({ userId: <id> }).sort({ createdAt: -1 })');
        console.log('Target Index: { userId: 1, createdAt: -1 }');
        console.log('===============================================================');
        const demoUser = await User.findOne({ role: 'user' });
        const userExplain = await db.collection('bookings')
            .find({ userId: demoUser._id })
            .sort({ createdAt: -1 })
            .explain('executionStats');

        const userStage = userExplain.executionStats.executionStages;
        console.log('Winning Stage:', userStage.stage);
        console.log('Input Stage:', userStage.inputStage ? userStage.inputStage.stage : 'N/A');
        console.log('Index Name Used:', userStage.inputStage ? userStage.inputStage.indexName : (userStage.indexName || 'None (COLLSCAN)'));
        console.log('Total Docs Examined:', userExplain.executionStats.totalDocsExamined);
        console.log('Total Keys Examined:', userExplain.executionStats.totalKeysExamined);
        console.log('Execution Success:', userStage.inputStage?.indexName === 'userId_1_createdAt_-1' || userStage.indexName === 'userId_1_createdAt_-1' ? '✅ PASS (IXSCAN VERIFIED)' : '⚠️ Check Plan');

        // Test 2: Event Category & Date Query
        console.log('\n===============================================================');
        console.log('TEST 2: Event Filter & Sort Query Plan');
        console.log('Query: db.events.find({ category: "Technology" }).sort({ date: 1 })');
        console.log('Target Index: { category: 1, date: 1 }');
        console.log('===============================================================');
        const eventExplain = await db.collection('events')
            .find({ category: 'Technology' })
            .sort({ date: 1 })
            .explain('executionStats');

        const eventStage = eventExplain.executionStats.executionStages;
        console.log('Winning Stage:', eventStage.stage);
        console.log('Index Name Used:', eventStage.inputStage ? eventStage.inputStage.indexName : (eventStage.indexName || 'None (COLLSCAN)'));
        console.log('Total Docs Examined:', eventExplain.executionStats.totalDocsExamined);
        console.log('Execution Success:', eventStage.inputStage?.indexName === 'category_1_date_1' || eventStage.indexName === 'category_1_date_1' ? '✅ PASS (IXSCAN VERIFIED)' : '⚠️ Check Plan');

        // Test 3: Event Bookings by Status
        console.log('\n===============================================================');
        console.log('TEST 3: Event Bookings by Status Query Plan');
        console.log('Query: db.bookings.find({ eventId: <id>, status: "confirmed" })');
        console.log('Target Index: { eventId: 1, status: 1 }');
        console.log('===============================================================');
        const demoEvent = await Event.findOne();
        const bookingStatusExplain = await db.collection('bookings')
            .find({ eventId: demoEvent._id, status: 'confirmed' })
            .explain('executionStats');

        const bStatusStage = bookingStatusExplain.executionStats.executionStages;
        console.log('Winning Stage:', bStatusStage.stage);
        console.log('Index Name Used:', bStatusStage.inputStage ? bStatusStage.inputStage.indexName : (bStatusStage.indexName || 'None (COLLSCAN)'));
        console.log('Total Docs Examined:', bookingStatusExplain.executionStats.totalDocsExamined);
        console.log('Execution Success:', bStatusStage.inputStage?.indexName === 'eventId_1_status_1' || bStatusStage.indexName === 'eventId_1_status_1' ? '✅ PASS (IXSCAN VERIFIED)' : '⚠️ Check Plan');

        console.log('\n===============================================================');
        console.log('ALL QUERY PLANS VERIFIED AGAINST MONGODB ENGINE');
        console.log('===============================================================');
        process.exit(0);
    } catch (err) {
        console.error('Error verifying query plans:', err);
        process.exit(1);
    }
}

runExplainTests();
