# EventPulse (Eventora-MERN) — Advanced Databases Project Handbook

**Academic Subject:** Advanced Databases (AD)  
**Deliverable Document:** `Eventora_AD_Handbook.pdf` (29 Pages, Fully Illustrated)  
**Companion Source:** `docs/HANDBOOK_SOURCE.html` and `docs/HANDBOOK.md`  
**Reference Repo:** [ShivaMani02/Eventora-MERN](https://github.com/ShivaMani02/Eventora-MERN)  
**Enhanced Academic Repo:** [jayraj0975/eventpulse-mern](https://github.com/jayraj0975/eventpulse-mern)  
**Live Web Application:** [https://client-xi-two-26.vercel.app](https://client-xi-two-26.vercel.app)  
**Live API Backend:** [https://api-production-ba9f.up.railway.app](https://api-production-ba9f.up.railway.app)  

---

## 30-Second Viva Introduction Script (Memorise This!)
> *"Good morning, Professor. EventPulse is an event discovery and reservation platform built on MongoDB and Express. While it provides a complete user experience for browsing events and reserving tickets, our primary academic contribution focuses on Advanced Database concepts: we engineered database-level atomic seat allocation using `findOneAndUpdate` with conditional predicates to prevent race conditions; we implemented three multi-stage aggregation pipelines for revenue and occupancy analytics; and we enforced data integrity using MongoDB partial unique indexes that block duplicate active bookings without preventing re-booking after cancellation."*

---

## Chapter Summary & Table of Contents

1. **Chapter 1: Project Overview & Academic Scope**
   - Problem statement, academic vs commercial priorities, full technology stack table.
2. **Chapter 2: Application Walkthrough with Visual Evidence**
   - High-resolution screenshots of Home, Register, Login, Admin Analytics Overview, Aggregation Data Tables, Event Detail, and User Dashboard.
3. **Chapter 3: System Architecture & Request Flow**
   - 3-tier MERN architecture vector diagram, end-to-end request tracing.
4. **Chapter 4: Complete Codebase Tour & File Responsibilities**
   - Monorepo directory structure, file responsibility matrix, caller/callee tracing.
5. **Chapter 5: Frontend Architecture (React, SPA, Tailwind)**
   - SPA routing, AuthContext state management, Axios request interceptors.
6. **Chapter 6: Backend Architecture (Express, Middleware, Controllers)**
   - Express REST route mapping table, authentication guards, role-based authorization.
7. **Chapter 7: Database Design — Mongoose Schemas & Relationships**
   - MongoDB document model vs relational schemas, Mongoose models, Entity-Relationship vector diagram.
8. **Chapter 8: Database Operations & Worked CRUD Tracing**
   - Code walkthroughs of seat reservation, document insertion, and guarded cancellation.
9. **Chapter 9: Booking Lifecycle, Concurrency & Seat Consistency**
   - Race conditions under concurrent load, atomic `$inc` updates, lifecycle state machine diagram.
10. **Chapter 10: Authentication, Authorisation & Security Flow**
    - Salted bcrypt password hashing (cost factor 10), JWT verification, RBAC guard middleware.
11. **Chapter 11: Advanced Database Concepts Demonstrated**
    - Summary of AD topics: atomic operations, partial unique indexes, multi-stage pipelines, explain plans.
12. **Chapter 12: Aggregation Pipelines & Index Query Plans**
    - Complete stage-by-stage breakdown of Pipeline 1 (Status Summary), Pipeline 2 (Revenue & Occupancy), and Pipeline 3 (Popularity Ranking); index `IXSCAN` query plan proof.
13. **Chapter 13: Environment Setup, Seeding & Execution**
    - Safe `.env` template (placeholders only), idempotent seeding script (`seed.js`), startup commands.
14. **Chapter 14: Verification, Automated Testing & Known Boundaries**
    - `npm test` test suite results, standalone MongoDB replica set boundaries, honest disclosures.
15. **Chapter 15: Step-by-Step 5-Minute Live Viva Demo Guide**
    - Exact demonstration workflow from user reservation to admin aggregation analytics.
16. **Chapter 16: Comprehensive Viva Preparation (35 Q&As)**
    - Categorized examiner questions and concise answers with codebase references.
17. **Chapter 17: Glossary, Quick Reference & Summary Sheets**
    - Technical definitions, one-page cheat sheet for the viva candidate.

---

## Key Advanced Database Implementations

### 1. Atomic Concurrency Control (Zero Overbooking)
```javascript
// server/controllers/bookingController.js
const event = await Event.findOneAndUpdate(
  { _id: eventId, availableSeats: { $gt: 0 } },
  { $inc: { availableSeats: -1 } },
  { new: true }
);
```

### 2. MongoDB Partial Unique Index (Duplicate Active Guard)
```javascript
// server/models/Booking.js
BookingSchema.index(
  { userId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);
```

### 3. Multi-Stage Aggregation Pipeline (Event Revenue & Occupancy)
```javascript
// server/controllers/analyticsController.js
const eventSummaries = await Event.aggregate([
  {
    $lookup: {
      from: 'bookings',
      localField: '_id',
      foreignField: 'eventId',
      as: 'bookings'
    }
  },
  {
    $project: {
      title: 1,
      totalSeats: 1,
      availableSeats: 1,
      verifiedRevenue: {
        $reduce: {
          input: '$bookings',
          initialValue: 0,
          in: {
            $add: [
              '$$value',
              {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$$this.status', 'confirmed'] },
                      { $eq: ['$$this.paymentStatus', 'paid'] }
                    ]
                  },
                  '$$this.amount',
                  0
                ]
              }
            ]
          }
        }
      },
      occupancyRate: {
        $round: [
          {
            $multiply: [
              { $divide: [{ $subtract: ['$totalSeats', '$availableSeats'] }, '$totalSeats'] },
              100
            ]
          },
          1
        ]
      }
    }
  },
  { $sort: { verifiedRevenue: -1 } }
]);
```
