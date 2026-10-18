# Nimbus Rideshare — Product Requirements Document

## Vision
Two Uber-style apps — **Passenger** and **Driver** — packaged in one Expo codebase, selectable via a launch role-selector. Both apps share a single FastAPI + MongoDB backend and demonstrate real-world ride-hailing flows: destination pick, fare estimation, ride matching, live driver tracking, in-app chat, Stripe (test-mode) payments, ratings, and ride history.

## Tech stack
- **Frontend**: Expo SDK 54 + Expo Router, TypeScript, React Native, Ionicons, custom MapView
- **Backend**: FastAPI, Motor (MongoDB async), PyJWT, bcrypt, stripe (Stripe SDK)
- **Storage**: MongoDB (users, rides, driver_status, chat_messages, payment_transactions)
- **Payments**: Stripe Checkout in test mode (sk_test_...)
- **Auth**: Custom JWT (Authorization: Bearer), passenger/driver role separation

## Key flows
1. **Role selector → Login/Register** (UI themes to the selected role)
2. **Passenger**: Map + destination search → ride options (Economy/Premium/XL) → request → matched driver → live trip tracking → pay (Stripe) → rate
3. **Driver**: Online toggle → incoming-request modal → accept → arrive → start → complete → earnings dashboard

## Demo accounts (seeded on startup)
- Passenger: `passenger@demo.com` / `Passenger123!`
- Driver: `driver@demo.com` / `Driver123!` (vehicle class: economy)

## Backend endpoints (all prefixed `/api`)
- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Passenger: `POST /rides/estimate`, `POST /rides/request`, `GET /rides/current`, `GET /rides/{id}`, `POST /rides/{id}/cancel`, `POST /rides/{id}/rate`, `GET /rides/history/list`, `GET /drivers/nearby`
- Driver: `POST /driver/status`, `POST /driver/location`, `GET /driver/incoming`, `GET /driver/earnings`, `POST /rides/{id}/accept`, `/arrive`, `/start`, `/complete`
- Chat: `GET/POST /rides/{id}/messages`
- Payments: `POST /payments/checkout`, `GET /payments/status/{id}`, `POST /webhook/stripe`

## Future enhancements (smart business ideas)
- **Surge pricing** in high-demand zones (boost driver earnings and platform take)
- **Ride scheduling** for airport runs (upsell premium class)
- **Referral codes** with $5 credit per signup for viral growth
- **Driver streak bonuses** (5 rides = $15 bonus) for retention
