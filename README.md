# EventPulse — Advanced Databases (AD) Mini-Project

An event-management and ticket-booking web platform enhanced with real database engineering, designed for the **Advanced Databases (AD)** curriculum. Built on the MERN stack (MongoDB, Express, React, Node.js), this project demonstrates practical database concepts including **aggregation pipelines**, **compound & partial unique indexes**, **atomic concurrency controls**, **query plan optimization with `explain()`**, and **schema-level integrity constraints**.

---
LINK- https://eventpulse-mern.vercel.app/login

## 1. Project Overview & Objective

* **Subject:** Advanced Databases (AD)
* **Application Domain:** Event Discovery, Ticket Booking, and Organizer Administration
* **Core Objective:** Transition a typical CRUD application into a robust, database-driven system where operational summaries, revenue tracking, and seat consistency are governed directly by MongoDB rather than in-memory client-side calculations.

### Problem Statement
Standard full-stack tutorials often delegate data analysis and constraint enforcement to the application layer (e.g., in-memory array filtering in React or non-atomic read-modify-write loops in Express). This leads to:
1. **Concurrency Race Conditions:** Simultaneous booking requests can oversell event capacity.
2. **Data Duplication:** Users submitting double clicks can create multiple active bookings for a single event.
3. **Performance Degradation:** Queries without compound indexes perform full collection scans (`COLLSCAN`), degrading as data volume scales.
4. **False Financial Reporting:** Client-side filters frequently conflate pending or unpaid tickets with actual revenue.

EventPulse resolves these issues using database-native features in MongoDB 7.0 / Mongoose 8.2.

---

## 2. Technology Stack & Architecture

* **Database:** MongoDB 7.0 (Docker / Atlas) via Mongoose 8.2 ODM
* **Backend:** Node.js (v24), Express.js 4.18 REST API, JWT Authentication, BCrypt password hashing
* **Frontend:** React 18, Vite 5, Tailwind CSS v3, React Router v6, Axios with Bearer Interceptor
* **Verification & Testing:** Native explain query tests, automated concurrency & aggregation test suite

### Request & Data Architecture Flow
```
[React Client] ──(HTTP/REST + JWT)──> [Express Middleware (auth, admin)]
                                              │
                                     [Mongoose Models & Controllers]
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
          [Atomic CRUD Operations]                          [Aggregation Pipelines]
          - Conditional findOneAndUpdate ($inc)             - Pipeline 1: $group (Status breakdown)
          - Partial Unique Indexes                          - Pipeline 2: $lookup + $reduce (Revenue)
          - Schema-level Validators                         - Pipeline 3: $match + $lookup + $sort (Popularity)
          - Query Plans via IXSCAN                          - Overview: $facet (Single-pass KPIs)
                     │                                                 │
                     └────────────────────────┬────────────────────────┘
                                              ▼
                                   [MongoDB Database: eventora]
```

---

## 3. Database Collections & Relationships

The database consists of 4 primary collections:

```
┌─────────────────────────┐          ┌──────────────────────────────────┐
│          users          │          │              events              │
├─────────────────────────┤          ├──────────────────────────────────┤
│ _id: ObjectId           │◄────┐    │ _id: ObjectId                    │◄────┐
│ name: String            │     │    │ title: String                    │     │
│ email: String (unique)  │     │    │ description: String              │     │
│ password: String (hash) │     │    │ date: Date                       │     │
│ role: 'user' | 'admin'  │     │    │ location: String                 │     │
│ isVerified: Boolean     │     │    │ category: String                 │     │
└─────────────────────────┘     │    │ totalSeats: Number (min: 1)      │     │
                                │    │ availableSeats: Number (min: 0)  │     │
                                │    │ ticketPrice: Number (min: 0)     │     │
                                │    │ createdBy: Ref(User)             │     │
                                │    └──────────────────────────────────┘     │
                                │                      ▲                      │
                                │                      │                      │
                                └───────────┐          │                      │
                                            │          │                      │
                                   ┌────────┴──────────┴────────┐             │
                                   │          bookings          │             │
                                   ├────────────────────────────┤             │
                                   │ _id: ObjectId              │             │
                                   │ userId: Ref(User)          │             │
                                   │ eventId: Ref(Event)        │             │
                                   │ status: enum               │             │
                                   │   ('pending'|'confirmed'|  │             │
                                   │    'cancelled')            │             │
                                   │ paymentStatus: enum        │             │
                                   │   ('paid'|'not_paid')      │             │
                                   │ amount: Number (min: 0)    │             │
                                   │ bookedAt: Date             │             │
                                   └────────────────────────────┘             │
                                                                              │
                                   ┌────────────────────────────┐             │
                                   │            otps            │             │
                                   ├────────────────────────────┤             │
                                   │ _id: ObjectId              │             │
                                   │ email: String              │             │
                                   │ otp: String                │             │
                                   │ action: String             │             │
                                   │ createdAt: Date (TTL 300s) │             │
                                   └────────────────────────────┘             │
```

---

## 4. Advanced Database Features Implemented

### A. MongoDB Aggregation Pipelines

All administrative metrics and reports are executed in the database engine via dedicated pipelines (`server/controllers/analyticsController.js`):

#### Pipeline 1 — Booking Status Summary (`GET /api/analytics/booking-status`)
* **Purpose:** Summarizes incoming booking requests by operational status without fetching thousands of records into memory.
* **Pipeline Stages:**
  1. `$group`: Groups by `_id: '$status'`, calculates `count: { $sum: 1 }`, total amount requested, and conditional counts for paid vs unpaid bookings using `$cond`.
  2. `$project`: Normalizes output document structure.
  3. `$sort`: Orders by booking frequency (`{ count: -1 }`).

#### Pipeline 2 — Event Booking & Revenue Summary (`GET /api/analytics/event-summary`)
* **Purpose:** Performs a multi-collection relational join and computes strictly verified financial revenue and real-time seat occupancy.
* **Pipeline Stages:**
  1. `$lookup`: Left outer joins `events` with `bookings` on `_id === eventId`.
  2. `$project`:
     * Computes `confirmedBookings`, `pendingBookings`, and `cancelledBookings` using `$filter` and `$size`.
     * Calculates `verifiedRevenue` using `$reduce` and `$cond` (only counting bookings where `status === 'confirmed'` AND `paymentStatus === 'paid'`).
     * Derives real-time `occupancyRate` percentage based on total seats and consumed seats.
  3. `$sort`: Orders by `verifiedRevenue: -1`.

#### Pipeline 3 — Event Popularity Ranking (`GET /api/analytics/event-popularity`)
* **Purpose:** Ranks events based on actual customer confirmation demand rather than unapproved pending requests.
* **Pipeline Stages:**
  1. `$match`: Filters `{ status: 'confirmed' }` (pruning cancelled/pending requests early).
  2. `$group`: Groups by `eventId`, summing confirmed tickets and paid revenue.
  3. `$lookup`: Joins with `events` collection to enrich title, category, and capacity.
  4. `$unwind`: Deconstructs event array to an object.
  5. `$project`: Formats clean report fields.
  6. `$sort`: Orders by `confirmedBookings: -1, paidRevenue: -1`.

#### Pipeline 4 — Executive Overview KPIs via `$facet` (`GET /api/analytics/overview`)
* **Purpose:** Uses multi-faceted aggregation to compute verified revenue, unique paid client counts (`$addToSet`), status tallies, and total bookings in a **single database pass**.

---

### B. Database Indexes & Query Plan Analysis

Indexes were intentionally designed to support the application's most frequent query patterns:

| Collection | Index Key | Index Type | Supported Query Pattern |
| :--- | :--- | :--- | :--- |
| `events` | `{ category: 1, date: 1 }` | Compound Index | Filter events by category and sort by date ascending |
| `events` | `{ date: 1 }` | Single-Field | Chronological event listings |
| `bookings` | `{ eventId: 1, status: 1 }` | Compound Index | Filtering bookings for a specific event by confirmation status |
| `bookings` | `{ userId: 1, createdAt: -1 }` | Compound Index | Fetching user's personal booking history in reverse-chronological order |
| `bookings` | `{ status: 1 }` | Single-Field | Admin pending queue queries & status aggregation |
| `bookings` | `{ userId: 1, eventId: 1 }` | **Partial Unique** (`status: 'confirmed'`) | Database-level integrity: prevents duplicate confirmed bookings |
| `bookings` | `{ userId: 1, eventId: 1 }` | **Partial Unique** (`status: 'pending'`) | Database-level integrity: prevents duplicate pending requests |
| `users` | `{ email: 1 }` | Unique Index | Enforces unique email credentials |
| `otps` | `{ createdAt: 1 }` | TTL Index (300s) | MongoDB engine automatically deletes expired OTPs after 5 minutes |

#### Verifying Query Plans with `explain('executionStats')`
Run the automated query verification script:
```bash
npm run test --prefix server
# or directly:
node server/scripts/verify-indexes-and-queries.js
```
Sample verified output proving **Index Scan (`IXSCAN`)**:
```
TEST 1: User Booking History Query Plan
Query: db.bookings.find({ userId: <id> }).sort({ createdAt: -1 })
Target Index: { userId: 1, createdAt: -1 }
Winning Stage: FETCH
Input Stage: IXSCAN
Index Name Used: userId_1_createdAt_-1
Total Docs Examined: 4 | Total Keys Examined: 4
Execution Success: ✅ PASS (IXSCAN VERIFIED)
```

---

### C. Atomic Concurrency & Booking Consistency

To eliminate race conditions when multiple users or admins act simultaneously:

1. **Atomic Conditional Decrement:**
   When an admin confirms a booking, seat capacity is decremented atomically using MongoDB's `$inc` operator guarded by a conditional query:
   ```javascript
   const updatedEvent = await Event.findOneAndUpdate(
       { _id: eventId, availableSeats: { $gt: 0 } },
       { $inc: { availableSeats: -1 } },
       { new: true }
   );
   ```
   If `availableSeats` is 0, the conditional query returns `null`, rejecting the confirmation without overbooking.

2. **Atomic Status Transition & Rollback Safeguard:**
   ```javascript
   const updatedBooking = await Booking.findOneAndUpdate(
       { _id: bookingId, status: 'pending' },
       { status: 'confirmed', paymentStatus },
       { new: true }
   );
   if (!updatedBooking) {
       // Rollback seat reservation if booking was concurrently modified
       await Event.findByIdAndUpdate(eventId, { $inc: { availableSeats: 1 } });
   }
   ```

3. **Safe Seat Restoration on Cancellation:**
   Seats are restored (`$inc: { availableSeats: 1 }`) **only** if the cancelled booking was in `'confirmed'` state. Duplicate cancellations or cancelling a pending booking do not artificially inflate available seats.

---

### D. Schema Validation & Data Integrity

Mongoose schemas enforce strict business invariants:
* **Ticket Prices:** Guarded by `min: [0, 'Ticket price cannot be negative']`.
* **Seat Quantities:** `totalSeats` requires `min: 1`, `availableSeats` requires `min: 0`.
* **String Sanitization:** Names, emails, and titles enforce trimming and length bounds.
* **Role Tampering Prevention:** Registration endpoint hardcodes `role: 'user'` to block privilege escalation.
* **Event Update Field Whitelisting:** `updateEvent` strips protected fields (like `availableSeats` and `createdBy`) so clients cannot alter seat counts directly.

---

## 5. Local Setup & Execution Guide

### Prerequisites
* Node.js v18+ (tested on Node v24)
* MongoDB 6.0+ (running locally or via Docker on port 27017)

### 1. Environment Configuration
Create a `.env` file inside the `server/` directory:
```env
MONGO_URI=mongodb://127.0.0.1:27017/eventora
JWT_SECRET=dev_jwt_secret_eventora_college_2026
PORT=5000
NODE_ENV=development
```

For the guided college demo flow, set `DEMO_MODE=true` **only in a controlled demo environment**. This enables the seeded `user@eventpulse.com` account to skip OTP and use a clearly labelled simulated checkout. No real payment is processed. Keep `DEMO_MODE=false` in production. Never expose an admin demo account or use demo credentials for real users.
*(Optional: If you wish to send live emails, supply `EMAIL_USER` and `EMAIL_PASS`. If left unconfigured, OTPs will print directly to the backend terminal for seamless offline testing).*

### 2. Install Dependencies
```bash
# From project root
npm run install:all
```

### 3. Seed Sample Database
Populate safe, realistic sample data (10 users, 6 categorized events, 20+ bookings, and synchronized indexes):
```bash
npm run seed --prefix server
```
Default accounts created:
* **Admin Account:** `admin@eventpulse.com` / `password123`
* **Demo User Account:** `user@eventpulse.com` / `password123`

### 4. Run the Full Application
```bash
# Starts backend (port 5000) and frontend (Vite port 5173) simultaneously
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 6. Testing & Verification Commands

All verifications can be executed via standard npm scripts:

| Command | Scope | What It Tests |
| :--- | :--- | :--- |
| `npm test` | Root / Server | Runs full AD verification suite: pipelines, partial unique index, atomic concurrency, seat restoration, and `explain()` index plans. |
| `npm run lint` | Root / Client | ESLint checks across React codebase. |
| `npm run build` | Root / Client | Vite production bundle compilation. |
| `node server/scripts/verify-indexes-and-queries.js` | Server | Demonstrates `IXSCAN` vs `COLLSCAN` on target queries for viva defense. |

---

## 7. Known Architectural Limitations

1. **Distributed Multi-Document Transactions:**
   In standalone (single-node) MongoDB instances without a replica set, multi-document ACID transactions (`session.withTransaction()`) require replica set configuration (`rs0`). This project achieves safe concurrency on standalone instances through single-document atomic conditional updates (`findOneAndUpdate` with `$inc` and `$gt: 0`) and programmatic compensating rollbacks.
2. **Third-Party Email Dependency:**
   To guarantee that demonstration and grading never fail due to Google SMTP rate limits or missing app passwords, the server automatically logs all generated OTP codes directly to the terminal when live email credentials are not supplied.
