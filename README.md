# Smart Parking Management System

A modular full-stack foundation for a real-world parking platform. The repository is a pnpm workspace with a React/Vite customer interface and an Express/Mongoose API. Phase 1 established the application shells and health endpoint; Phase 2 adds authentication and user profiles; Phase 3 adds parking locations, slots, reservations, and realtime availability.

## Technology

- React 19, Vite, Tailwind CSS 4
- Node.js, Express 5, Mongoose 8, MongoDB
- bcryptjs password hashing, JWT access authentication, opaque rotating refresh credentials
- HTTP-only cookies, Helmet, CORS, rate limiting, Zod validation
- SMTP password reset email delivery
- Socket.IO availability subscriptions and updates
- Razorpay Test Mode Checkout with signed server verification and webhook deduplication
- Hashed one-time QR access credentials and entry/exit audit events
- QR rendering/scanning with `qrcode` and `@zxing/browser`
- Node's built-in test runner, Supertest, MongoDB Memory Server

## Requirements

- Node.js 20.19+ or 22.12+ (Node.js 24 is supported)
- pnpm 10+
- MongoDB 7+ for local API startup
- SMTP credentials to deliver password reset links

## Quick start

1. Install workspace dependencies: `pnpm install`
2. Copy `server/.env.example` to `server/.env`.
3. Set a strong `JWT_ACCESS_SECRET` (at least 32 bytes). Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
4. Set `MONGODB_URI` and SMTP settings. Password reset email delivery is unavailable until SMTP is configured.
5. Start MongoDB locally or provide a reachable MongoDB URI.
6. Start both development servers: `pnpm dev`.
7. Open `http://localhost:5173`; the API listens on `http://localhost:5000`.

The API refuses to start when the JWT secret or database is unavailable. `GET /api/health` returns `200` when MongoDB is connected and `503` with a degraded status otherwise.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run API and client together |
| `pnpm dev:client` | Run Vite only |
| `pnpm dev:server` | Run API with Node watch mode |
| `pnpm build` | Build frontend for production |
| `pnpm test` | Run backend unit and integration tests |

## Environment configuration

`server/.env.example` is the reference. The root `.env.example` mirrors it for IDEs. `client/.env.example` contains only the public API base URL. Environment files are ignored by Git; do not commit secrets.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime mode (`development`, `test`, or `production`) |
| `PORT` | API listen port (default `5000`) |
| `CLIENT_ORIGIN` | Exact trusted web origin (default `http://localhost:5173`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Random secret of at least 32 bytes; required to start the API |
| `ACCESS_TOKEN_TTL` | JWT access token lifetime (default `10m`) |
| `REFRESH_TOKEN_DAYS` | Refresh-session lifetime (default `30`) |
| `PASSWORD_RESET_MINUTES` | One-time reset-link lifetime (default `15`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP endpoint configuration |
| `SMTP_USER`, `SMTP_PASSWORD` | SMTP credentials |
| `SMTP_FROM` | Sender identity for reset mail |

## Authentication behavior

- Public registration always creates a `customer`. Submitted `role` values are rejected. `parking_owner` and `admin` accounts must be provisioned by trusted operators; they cannot be selected through registration or profile updates.
- Passwords are validated and bcrypt-hashed with a work factor of 12. Password hashes are excluded from normal queries and all API representations.
- Login and registration return the sanitized user profile and set two `HttpOnly`, `SameSite=Strict` cookies. The short-lived JWT access cookie is scoped to `/api/v1`; the long-lived refresh cookie is scoped to `/api/v1/auth`. Cookies are `Secure` in production.
- Access JWTs are never placed in local storage or response bodies. On app load the browser silently rotates its refresh cookie and restores the user profile. Refresh credentials are random opaque tokens; only SHA-256 hashes are persisted. Each refresh consumes its old credential before issuing the next one, preventing replay. Logout revokes the current refresh credential and clears both cookies.
- Password reset requests return the same response for known and unknown addresses. When SMTP is configured, the one-time random reset token is emailed and only its hash is stored. Reset tokens expire, are single-use, and resetting a password revokes existing refresh sessions.
- Authentication endpoints are rate-limited. Cookie-authenticated mutations check the request origin, and CORS is restricted to `CLIENT_ORIGIN` with credentials enabled.

## Authentication API (`/api/v1/auth`)

JSON requests use `Content-Type: application/json`. Browser clients must send cookies (`credentials: include`). Responses never contain password hashes, refresh tokens, or password-reset tokens.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /register` | Public | Create a customer account; body: `name`, `email`, `password`, optional `phone` |
| `POST /login` | Public | Sign in; body: `email`, `password` |
| `POST /refresh` | Refresh cookie | Rotate refresh session and issue a new access cookie |
| `POST /logout` | Refresh cookie | Revoke current refresh session and clear cookies |
| `GET /me` | Access cookie | Retrieve current user profile |
| `PATCH /me` | Access cookie | Update `name` and/or `phone` |
| `POST /password/forgot` | Public, rate-limited | Request reset email; body: `email` |
| `POST /password/reset` | Public, rate-limited | Apply one-time reset; body: `token`, `password` |

Successful login and registration return `{ "user": { "id", "name", "email", "phone", "role", "createdAt", "updatedAt" } }` and set cookies. Errors use `{ "error": { "code", "message", "fields?" } }`. Common statuses include `400` for validation, `401` for unauthenticated/invalid credentials, `403` for role/origin denial, `409` for a duplicate email, and `429` for rate limiting.

Protected routes use `authenticate` and `requireRoles('parking_owner')` / `requireRoles('admin')` middleware from `server/src/modules/auth/auth.middleware.js`. The role demonstration endpoints exist only in `NODE_ENV=test`; business owner/admin routes will be added with their respective application phases.

## Frontend pages

- `/login` — customer sign-in
- `/register` — customer registration
- `/forgot-password` — request a password reset email
- `/reset-password?token=…` — choose a new password from the emailed link
- `/profile` — view and update the signed-in user's name and phone; sign out
- `/parking` — search active parking by text, city, vehicle category, and hourly price
- `/parking/:locationId` — view location details, select a time and vehicle, see live slot availability, and reserve
- `/bookings` — customer booking history and eligible cancellations
- `/owner` — owner/admin location, slot, and booking dashboard

Authentication state is restored from the HTTP-only refresh cookie and held in React memory. No credential or token is saved to browser local storage.

## Project layout

```text
client/src/features/auth/     Auth context, forms, and pages
client/src/features/parking/  Search, details, booking, and owner dashboard
client/src/lib/               Credentialed API client
server/src/config/            Environment and MongoDB setup
server/src/models/            Users, locations, slots, bookings, and token claims
server/src/modules/auth/      Auth routes, validation, tokens, and mail
server/src/modules/parking/   Location, slot, availability, and booking routes/services
server/src/realtime/          Socket.IO authorization and availability events
server/test/                  Unit, REST integration, concurrency, and realtime tests
```

## Parking, slots, and booking API

All routes are under `/api/v1`. Location search and details are public. Location/slot write routes require a `parking_owner` or `admin` access cookie. Customer bookings require a `customer` access cookie. Admins can manage every owner's inventory; parking owners can only manage locations whose `ownerId` matches their account.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /locations` | Public | Search by `q`, `city`, `latitude`, `longitude`, `radiusKm`, `vehicleType`, and `maxHourlyPricePaise`; supports `page` and `limit`; optional `startAt` and `endAt` report availability |
| `POST /locations` | Owner/admin | Create a location with address, coordinates, timezone, operating hours, and description; only admins may set `ownerId` |
| `GET /locations/:id` | Public | Get active location details |
| `PATCH /locations/:id` | Owner/admin | Update details, coordinates, operating hours, timezone, or active/inactive status |
| `DELETE /locations/:id` | Owner/admin | Archive the location (soft delete, preserving booking history) |
| `GET /locations/:id/availability` | Public | Return per-slot availability for the requested interval |
| `GET /locations/:id/slots` | Public | List active/maintenance slots and availability; optional `vehicleType`, `startAt`, and `endAt` |
| `POST /locations/:id/slots` | Owner/admin | Add a unique slot number, vehicle category, and `hourlyPricePaise` |
| `PATCH /locations/:id/slots/:slotId` | Owner/admin | Update slot number/category/price/status; upcoming bookings prevent deactivation or category changes |
| `DELETE /locations/:id/slots/:slotId` | Owner/admin | Deactivate a slot; upcoming bookings prevent deactivation |
| `GET /owner/locations` | Owner/admin | List owned locations and slots; admins see all |
| `POST /bookings` | Customer | Reserve a slot; amount and status are calculated/set by the server |
| `GET /bookings` | Customer/admin | List own bookings (admins may list across accounts) |
| `GET /bookings/:id` | Customer/admin | Get a booking; customers can read only their own |
| `POST /bookings/:id/cancel` | Customer | Cancel own confirmed booking before its start time |
| `GET /owner/bookings` | Owner/admin | List bookings for managed locations; optional `status` |
| `POST /owner/bookings/:id/complete` | Owner/admin | Mark an ended confirmed booking complete |

Prices are integer paise in the API. Booking prices use the slot's current hourly price and round any partial hour up to the next hour. The API accepts minute-aligned start/end times, reservations from 1 minute to 24 hours, and bookings must fit within the location's local operating hours. Operating hours use ISO weekdays (`0` Sunday through `6` Saturday), `HH:mm`, and may close at `24:00`; overnight windows are not supported. The UI accepts hourly price in whole rupees and converts it to paise.

Bookings claim each requested minute in `ReservationClaim`. A MongoDB unique partial index on `{ slotId, minuteStart }` for active claims is the atomic exclusion constraint: only one concurrent request can claim an overlapping minute. This works with standalone MongoDB and does not rely on multi-document transactions. Failed booking creation releases partial claims; cancellation deactivates claims so another request can reserve the freed interval. A TTL index removes expired claim documents after their reservation window. Booking records remain for history, and location/slot removal is a soft status change.

### Realtime availability

Socket.IO uses path `/api/v1/socket.io` and the same-origin credentials configuration. The access cookie authenticates sockets when present; invalid cookies are rejected. Clients join a public availability room with `availability:subscribe` and `{ "locationId": "…" }`, and leave with `availability:unsubscribe`. The server emits `availability:update` with location/slot status or a slot's availability for a specific interval after slot, booking, cancellation, or location-status changes. Socket events are read-only; reservations and cancellations remain REST operations.

## Security baseline and scope

Helmet sets common HTTP security headers, Express's identifying header is disabled, CORS uses the exact configured origin, and JSON request bodies are limited to 100 KB. Authentication secrets and SMTP credentials stay server-side. Refresh/reset token data are hashed at rest, and account lookup errors are generic where needed to limit account enumeration.

Phases 1–4 implement the application foundation, authentication/profile management, parking inventory/bookings/realtime availability, Razorpay Test Mode payments, and QR entry/exit. Broader admin analytics remain a later phase.
# Phase 4: Payments and secure parking access

The payment integration is restricted to Razorpay Test Mode. Configure `RAZORPAY_MODE=test`, a test key ID beginning `rzp_test_`, its test key secret, and a webhook secret in `server/.env`. The backend rejects live key IDs and never returns the key secret. Configure the Razorpay webhook URL as `/api/v1/payments/webhook` and subscribe to `payment.captured` and `payment.failed`. Webhook signatures are verified against the raw request body.

The customer creates a booking, then requests a payment order. The server sets the amount from the stored booking, reuses an active order on repeat requests, and verifies Checkout's HMAC signature plus the provider's captured payment record before setting the booking paid. A frontend success callback alone never marks a booking paid. Failed and dismissed attempts can be retried. Captured payment for a cancelled or inconsistent booking is marked for administrator reconciliation and does not enable access.

### Payment and access endpoints

All endpoints are under `/api/v1` and use the existing secure, HttpOnly access cookie unless marked webhook.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /payments/bookings/:bookingId/order` | Customer who owns booking | Create or retrieve a Razorpay test order |
| `POST /payments/verify` | Customer | Verify `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` server-side |
| `POST /payments/:paymentId/cancel` | Customer who owns payment | Record dismissed Checkout attempt |
| `GET /payments/history` | Customer; admin | List safe payment history |
| `GET /payments/:paymentId/receipt` | Owning customer; admin | Get receipt data for captured payment |
| `GET /payments/reconciliation` | Admin | List payments requiring review |
| `POST /payments/webhook` | Razorpay signature | Idempotent provider event processing via `x-razorpay-event-id` |
| `POST /bookings/:bookingId/access-ticket` | Customer who owns paid booking | Issue one-time entry or exit QR credential |
| `POST /bookings/access/verify` | Parking owner; admin | Verify QR and record entry or exit |

QR credentials are generated with cryptographic randomness. Only their SHA-256 hashes are stored. Each credential is bound to a booking and customer, expires at the booking end plus a short exit grace period, and is consumed once. After entry, the customer requests a fresh exit QR. Access records include the staff user, credential record, and timestamp. Staff access also checks ownership of the parking location.

The frontend uses Razorpay Standard Checkout (`https://checkout.razorpay.com/v1/checkout.js`), shows customer QR tickets and receipts, and provides `/access-scanner` for staff. Keep Razorpay test credentials in the local server environment and never commit `.env` files.
