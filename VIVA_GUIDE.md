# Eventora — Viva Preparation & Demonstration Guide

This guide is designed for the **Advanced Databases (AD)** viva examination. It contains a 3-minute live demonstration script followed by 15 high-value examination questions with concise, technically accurate answers derived directly from the code.

---

## Part 1: 3-Minute Live Demonstration Script

Follow this exact sequence to demonstrate the project to the examiner:

### Step 1: Show Safe Seeding & Index Synchronization (30 seconds)
1. Open a terminal in the project directory.
2. Run:
   ```bash
   npm run seed --prefix server
   ```
3. Point out to the examiner:
   * *"We seed 10 users, 6 events across different categories, and randomized bookings."*
   * *"Notice that `syncIndexes()` runs automatically, ensuring compound indexes and partial unique indexes are created in MongoDB before any operations begin."*

### Step 2: Show the Query Plan Optimization (`explain()`) (45 seconds)
1. In the terminal, run:
   ```bash
   node server/scripts/verify-indexes-and-queries.js
   ```
2. Point to the terminal output:
   * *"Here is our query plan verification. For the user booking history query, MongoDB uses an Index Scan (`IXSCAN`) via the compound index `{ userId: 1, createdAt: -1 }` instead of a full collection scan (`COLLSCAN`)."*
   * *"Total documents examined matches the total keys examined, which minimizes memory and CPU overhead."*

### Step 3: Demonstrate User Booking & OTP Verification (45 seconds)
1. Start the app: `npm run dev`.
2. Open browser at `http://localhost:5173`.
3. Log in as regular user (`user@eventora.com` / `password123`).
4. Click on an event (e.g. "React & Node.js Developer Retreat") and click **Book Ticket**.
5. Show the OTP dialog:
   * *"The backend generates a 6-digit cryptographic OTP stored with a 300-second TTL in MongoDB."*
   * Look at the backend terminal to grab the printed OTP code.
   * Enter the code and submit. Show that the booking enters `pending` status in the User Dashboard.
   * Explain: *"The seat count is NOT decremented yet. It remains pending until admin review."*

### Step 4: Demonstrate Admin Dashboard & Real Aggregation Reports (60 seconds)
1. Log out and log in as Admin (`admin@eventora.com` / `password123`).
2. Navigate to the **Admin Dashboard**.
3. Point out the top 4 KPI cards:
   * *"These numbers are not hardcoded or calculated in React. They are returned by our `/api/analytics/overview` endpoint using MongoDB's `$facet` operator to compute verified revenue and client counts in a single database pass."*
4. Scroll to the **MongoDB Aggregation Reports** section:
   * **Pipeline 1 (Status Summary):** Show bookings grouped by `pending`, `confirmed`, `cancelled` using `$group` and `$cond`.
   * **Pipeline 2 & 3 (Event Popularity & Revenue Ranking):** Show the table ranking events by confirmed demand and paid revenue using `$match`, `$group`, `$lookup`, and `$sort`.
5. Click **✓ Approve as Paid** on the pending booking:
   * Point out: *"The booking status changes to `confirmed`, the seat is atomically decremented by 1 using `$inc`, and verified revenue updates immediately across the aggregation reports."*

---

## Part 2: 15 Viva Questions & Model Answers

### Q1: Why did you choose MongoDB instead of a traditional relational database (RDBMS) like MySQL for Eventora?
**Answer:**
> "MongoDB provides flexible JSON document modeling with dynamic schemas, making it natural to represent rich event metadata, nested descriptions, and evolving ticket structures. For high-volume event platforms, MongoDB offers horizontal scalability through sharding, native geospatial indexing for event venues, and an expressive Aggregation Pipeline that enables real-time reporting without complex SQL joins."

### Q2: How does MongoDB represent relationships between Users, Events, and Bookings?
**Answer:**
> "We use **normalized document references** (`ObjectId` references). A `Booking` document references both `userId` and `eventId`. We chose reference linking over embedding because bookings grow unbounded over time, and embedding bookings inside an Event document could exceed MongoDB's 16MB document limit and cause frequent document resizing."

### Q3: What is a MongoDB Aggregation Pipeline, and how does it differ from a standard `find()` query?
**Answer:**
> "A standard `find()` query filters and returns raw documents from a single collection. An Aggregation Pipeline processes documents through sequential transformation stages—such as filtering (`$match`), grouping (`$group`), joining collections (`$lookup`), reshaping fields (`$project`), and sorting (`$sort`). The computations occur directly inside the database engine, returning processed summary metrics rather than sending large arrays over the network."

### Q4: Explain the pipeline stages used in your Event Booking & Revenue Summary report.
**Answer:**
> "In Report 2:
> 1. `$lookup` performs a left outer join between `events` and `bookings` matching `_id` with `eventId`.
> 2. `$project` utilizes `$filter` and `$size` to count confirmed, pending, and cancelled bookings.
> 3. It computes verified revenue using `$reduce` and `$cond`, strictly summing amounts where status is 'confirmed' AND paymentStatus is 'paid'.
> 4. It calculates an occupancy percentage based on `totalSeats` and `availableSeats`.
> 5. `$sort` orders the events by verified revenue descending."

### Q5: Why do you calculate revenue using aggregation instead of using JavaScript `.reduce()` on the frontend?
**Answer:**
> "Calculating revenue on the frontend requires transferring every booking record over the network, which consumes unnecessary bandwidth and crashes if thousands of bookings exist. By delegating this to MongoDB's Aggregation Framework, the database engine processes millions of documents in parallel and returns a single lightweight summary object, ensuring O(1) network payload."

### Q6: How do you prevent overbooking when two users book the last available seat simultaneously?
**Answer:**
> "We prevent race conditions using an **atomic conditional update** in MongoDB:
> ```javascript
> Event.findOneAndUpdate(
>   { _id: eventId, availableSeats: { $gt: 0 } },
>   { $inc: { availableSeats: -1 } },
>   { new: true }
> );
> ```
> Because MongoDB write operations on a single document are atomic, only one concurrent request can satisfy `{ availableSeats: { $gt: 0 } }`. The losing request receives `null` and is rejected with an HTTP 400 error."

### Q7: What indexes did you create on the `Booking` collection and why?
**Answer:**
> "We created:
> 1. Compound index `{ userId: 1, createdAt: -1 }`: Optimizes user booking history queries by user and date.
> 2. Compound index `{ eventId: 1, status: 1 }`: Optimizes event-level booking status lookups.
> 3. Single index `{ status: 1 }`: Accelerates admin filtering for pending requests.
> 4. Partial unique indexes `{ userId: 1, eventId: 1 }` with `{ status: 'confirmed' }` and `{ status: 'pending' }` to prevent duplicate active bookings."

### Q8: What is a Partial Unique Index, and how does it enforce business logic here?
**Answer:**
> "A standard unique index on `{ userId, eventId }` would permanently block a user from booking an event even if their previous booking was cancelled. A **partial unique index** applies the uniqueness constraint only to documents matching a `partialFilterExpression` (e.g., `{ status: 'confirmed' }`). This enforces that a user cannot hold two active tickets simultaneously, while still allowing them to re-book if their prior attempt was cancelled."

### Q9: How did you verify that your indexes are actually being used?
**Answer:**
> "We executed queries with `.explain('executionStats')` using our verification script. In the explain output, we verified that the winning execution stage is `IXSCAN` (Index Scan) rather than `COLLSCAN` (Collection Scan), and that `totalKeysExamined` and `totalDocsExamined` are minimal compared to collection size."

### Q10: What is the trade-off of adding database indexes?
**Answer:**
> "While indexes dramatically accelerate read query performance (reducing query complexity from O(N) to O(log N)), they introduce write overhead because every `insert`, `update`, and `delete` requires updating the index B-tree. Indexes also consume additional RAM and disk space. Therefore, we only indexed fields used in frequent `$match`, filter, and sort stages."

### Q11: How does the OTP expiration mechanism work in MongoDB?
**Answer:**
> "We use a **TTL (Time-To-Live) index** on the `createdAt` field of the `OTP` collection with `{ expires: 300 }`. MongoDB's background TTL thread periodically deletes documents older than 5 minutes, ensuring expired OTP codes are purged automatically without manual cleanup scripts."

### Q12: What happens if an admin cancels a confirmed booking vs a pending booking?
**Answer:**
> "Our `cancelBooking` controller checks the prior status:
> * If the booking was `confirmed`, the seat was previously deducted, so we atomically increment `availableSeats` using `$inc: { availableSeats: 1 }`.
> * If the booking was `pending`, no seat had been deducted yet, so cancelling it transitions status to `cancelled` without modifying available seats.
> * If an already cancelled booking is cancelled again, the query `{ status: { $ne: 'cancelled' } }` fails, preventing duplicate seat increments."

### Q13: What schema validations did you enforce in Mongoose?
**Answer:**
> "We enforced:
> * `ticketPrice`: `min: [0, 'Ticket price cannot be negative']`
> * `totalSeats`: `min: [1, 'Total seats must be at least 1']`
> * `availableSeats`: `min: [0, 'Available seats cannot be negative']`
> * Trimming and minimum length constraints on titles, descriptions, and user names.
> * Regular expression email validation and enum restrictions on status fields."

### Q14: Why do you distinguish between 'Verified Revenue' and 'Total Amount Requested'?
**Answer:**
> "In event platforms, pending booking requests and unpaid tickets do not represent actual realized income. Counting unapproved requests as revenue inflates financial statements. Our aggregation pipeline strictly defines revenue as `status === 'confirmed' AND paymentStatus === 'paid'`, treating pending requests as potential pipeline demand rather than actual revenue."

### Q15: What are the limitations of single-document atomic updates compared to multi-document ACID transactions?
**Answer:**
> "MongoDB provides multi-document ACID transactions via `session.withTransaction()`, but they require a replica set cluster. On standalone developer instances, we use single-document atomic conditional updates (`findOneAndUpdate` with `$inc` and `$gt: 0`) alongside programmatic compensating actions (rollbacks). This guarantees seat integrity without the operational complexity of deploying a full replica set."
