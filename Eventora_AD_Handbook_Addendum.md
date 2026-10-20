# EventPulse AD Handbook — Deployment & Demo Safety Addendum

**Purpose:** Supplement the existing Eventora AD Project Handbook with the current deployment behavior, safe setup commands, and verification status. Keep this addendum with the PDF until the PDF itself is regenerated.

## 1. Current application links

- Frontend: https://eventpulse-mern.vercel.app
- Backend health endpoint: https://api-production-ba9f.up.railway.app/api/health
- Source repository: https://github.com/jayraj0975/eventpulse-mern

These are the configured URLs. Verify them immediately before presenting. A successful deployment/build check alone is not proof that login, booking, admin reports, or email verification work end to end.

## 2. Demo-mode boundaries

- The demo account and sample credentials are intended for a disposable local/demo database, not real users or production secrets.
- The OTP bypass and simulated checkout are intentionally disabled in production. A production booking must use normal account/booking verification; simulated checkout does not represent a real payment.
- Do not promise that demo users exist in the public database. Production seeding is disabled.
- Never run a seed or destructive integration test against a production database.

## 3. Local demo setup

Configure `server/.env` with a local disposable database and a unique random JWT secret:

```env
MONGO_URI=mongodb://127.0.0.1:27017/eventpulse_dev
JWT_SECRET=<generate-a-long-random-local-secret>
PORT=5000
NODE_ENV=development
DEMO_MODE=true
```

Seed only the local demo database:

```bash
ALLOW_DEMO_SEED=true MONGO_URI=mongodb://127.0.0.1:27017/eventpulse_dev npm run seed --prefix server
```

Start the app from the repository root with `npm run dev`. The local demo seed uses the documented sample credentials in README. Do not reuse sample credentials for real accounts.

## 4. Integration tests and query plans

Use a separate database whose name contains `test`. The test scripts require `TEST_MONGO_URI` and reject production-like database names:

```bash
TEST_MONGO_URI=mongodb://127.0.0.1:27017/eventpulse_test npm test
TEST_MONGO_URI=mongodb://127.0.0.1:27017/eventpulse_test node server/scripts/verify-indexes-and-queries.js
```

CI seeds its isolated `eventpulse_test` database explicitly. Do not point `TEST_MONGO_URI` or `MONGO_URI` at production.

## 5. Database concepts to demonstrate

1. **Aggregation pipelines:** booking-status grouping, event/revenue summary with `$lookup`, popularity ranking, and executive KPIs using `$facet`.
2. **Indexes and query plans:** use the verification script to inspect `explain('executionStats')` and confirm the actual winning stage/index; do not claim IXSCAN for a run unless its output proves it.
3. **Concurrency and seat integrity:** conditional atomic seat updates and booking-state transitions; explain the compensating rollback and its limitations.
4. **Partial unique indexes:** uniqueness constraints for active pending/confirmed bookings, while allowing rebooking after cancellation.
5. **Revenue semantics:** simulated checkout stays `not_paid`; revenue calculations must only count confirmed, genuinely paid bookings.

## 6. Before the viva

- Open the frontend and backend health endpoint.
- Test a real login path and confirm the relevant account exists.
- Walk through booking, admin approval, seat counts, and analytics using a disposable demo database.
- Run the frontend build/lint and backend integration suite; show actual output from the current commit.
- If email credentials are not configured in the local environment, use the documented local console/demo flow. Production verification requires working email delivery configuration.
- Do not show secrets, database connection strings, personal customer data, or production credentials in screenshots or terminal output.

## 7. Verification honesty

Record the commit SHA and the exact CI run used for the presentation. Mark each check as passed only after it actually completed. A deployment status and a green frontend build do not substitute for an end-to-end browser smoke test.

This addendum supplements, but does not replace, the existing 29-page PDF handbook. Regenerate the PDF from the current source documentation when the project documentation is finalized.
