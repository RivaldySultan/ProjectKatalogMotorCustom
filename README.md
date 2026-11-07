# Custom Motorcycle Catalog

## Structure

- `client/` — React and Vite frontend for the homepage, catalog, motorcycle details, and build consultations.
- `server/` — Express API, routes, authentication, and SQLite database.
- `server/src/db/data.json` — seed data used when the SQLite database is created.

## Running the application

Use Node.js 22 or later.

```sh
npm install
npm run dev
```

This command runs the API and frontend together in one terminal. Their logs are interleaved with `[api]` and `[web]` prefixes.

- Frontend: http://localhost:5173
- API: http://localhost:5000

To run them separately, use `npm run dev:server` and `npm run dev:client` in two different terminals.

The Vite frontend proxies `/api` and `/uploads` requests to the local API on port 5000. To build the frontend, run `npm run build`.

## Development admin setup

Admin authentication uses the `admins` table and dedicated admin middleware. Customer accounts are stored separately in the `customers` table and do not have admin access. Admin active status is stored in `is_active`; existing accounts are automatically migrated as active.

Copy the environment template, then enter your own values in `server/.env`:

```powershell
Copy-Item server\.env.example server\.env
notepad server\.env
```

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to your chosen credentials. The password must be unique, at least 8 bytes, and no more than 72 bytes. A longer, unique password is recommended; do not use the placeholder example as a password. Generate a random `JWT_SECRET` with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copy the result into `JWT_SECRET` in `server/.env`. This environment file is ignored by Git. Bootstrap the account with:

```powershell
npm run setup:admin --workspace server
```

The API and admin setup script load `server/.env` relative to their source files, so they also find it when PM2 starts the process from the repository root.

The bootstrap command is safe to run repeatedly. It creates only one account, updates credentials when the configured email matches an existing account, and refuses to create a second account with a different email. Passwords are stored in the database only as bcrypt hashes.

Customer password recovery uses the account's security question. The answer is bcrypt-hashed, and `PASSWORD_RESET_SECRET` (or `JWT_SECRET` when not set) protects short-lived reset grants. Admin password recovery is not available.

The existing development database has one active admin account with the email `rukamotor@gmail.com`. Its existing password is not displayed or provided. After setting your password and `JWT_SECRET` in `server/.env`, run the bootstrap command, then `npm run dev`. Open `http://localhost:5173/admin/login` and sign in with the email and password from your local environment. Login issues an admin-role JWT; the dashboard and catalog mutation endpoints verify the role, identity, and active account status in the database.

## Build consultation form

The consultation form on the motorcycle details page sends `POST /api/consultations` as `multipart/form-data`. Requests and build references are stored in the existing `orders` table. Attachments accept JPG/PNG, up to 3 photos with a 5 MB limit per photo, and are stored in `server/uploads/consultations/`.

## Admin consultation management

The admin page is available at `http://localhost:5173/admin/orders` and uses consultation data from the same `orders` table as the public form. The list supports name and WhatsApp searches, product/build filters, date sorting, and pagination.

List, detail, photo, and consultation status update endpoints require a valid admin JWT:

- `GET /api/consultations` — consultation list and filter/pagination metadata.
- `GET /api/consultations/:id` — customer identity, build reference snapshot, requirements, date, status, and private photo URLs.
- `GET /api/consultations/:id/photos/:index` — serves a photo after verifying the admin.
- `PATCH /api/consultations/:id/status` — updates the status only to values already used in the consultation table.

Consultation photos are not served from the public upload directory. The existing schema already provides `status` with a default value of `baru`, so this feature adds no tables or migrations. No other business status or transition list has been defined; the interface offers only status values already recorded.

## Direct purchases and manual transfers

Direct purchases use the `purchase_orders` schema, separate from the `orders` table used for consultations. The three seeded builds are configured for made-to-order purchases with the prices and fixed specification text in `server/src/db/data.json`. A one-time startup migration enables legacy rows only when they still have the original disabled/empty purchase configuration; other product settings are preserved. Back up the SQLite database before deploying this migration. Ready-stock products still require an explicit quantity.

Checkout is available at `/checkout/:productId`. After checkout, customers receive a private link at `/pesanan/:orderId#<access-token>`; the token is in the URL fragment and is sent to the API in a header, not as part of the request URL. The price, specifications, and build identity are taken from the database and saved as an order snapshot. Orders require admin approval before transfer instructions become available. Shipping costs are never estimated; an admin confirms the shipping cost before approving a delivery order. For pickup, customers can choose GoPay or SeaBank when configured on the server. Enter the correct recipient number and name in your local `server/.env`:

```env
PAYMENT_GOPAY_NUMBER=
PAYMENT_GOPAY_ACCOUNT_NAME=
PAYMENT_SEABANK_ACCOUNT_NUMBER=
PAYMENT_SEABANK_ACCOUNT_NAME=
```

Methods without valid configuration are not displayed, and the endpoint will not create an order if a method is not ready. Do not use example values as active account details. Payments are still made by manual transfer; submitted proofs only move to the `waiting_verification` status. Customers can view the status and upload or update proof through their private access link. Payment is marked `paid` only after an admin verifies receipt of funds and confirms it on `/admin/purchases`. Proofs are stored in a private directory and are not accessible through public upload URLs. No payment gateway is active.

The catalog's `Order via WhatsApp` action can also start a direct order without a customer login. The customer enters a name, full address, city, and optional note; the WhatsApp draft includes those details, the selected build, price, and catalog specifications. The customer still needs to send the draft in WhatsApp, and the admin must confirm the order there. This does not create a web checkout order or save the WhatsApp form.

Customers can chat with Ruka about an order from its private status link or the order detail in `/akun/pesanan`. Admins can read and reply from that order's detail page in `/admin/purchases`. Conversations are stored per purchase order, require the order access token or the signed-in customer owner for customer access, and refresh every five seconds while open. Text messages are limited to 2,000 characters, with a per-sender limit of 20 messages per order per minute.

For production, configure these four variables in the hosting provider's environment settings or in `server/.env` on the VPS. The local `.env` file is ignored by Git and is not included in deployments. Restart the backend service after changing its environment, then check `GET /api/purchases/payment-methods`; the response should list each configured method before enabling checkout.

Public purchase endpoints:

- `GET /api/purchases/payment-methods` — transfer methods with complete server configuration.
- `POST /api/purchases` — creates an order; price and product are validated server-side, with an idempotency key.
- `GET /api/purchases/:id` — retrieves order status using the `X-Order-Access-Token` header.
- `POST /api/purchases/:id/payment-proof` — submits JPG/PNG proof using the order access header.

Admin endpoints require admin authentication:

- `GET /api/purchases/admin` and `GET /api/purchases/admin/:id` — purchase list and details.
- `PATCH /api/purchases/admin/:id/approval` — approves an order or rejects it with a reason; only pending orders can be decided.
- `GET /api/purchases/admin/:id/proof` — private payment proof.
- `POST /api/purchases/admin/:id/shipping-quote` — saves the confirmed shipping cost.
- `POST /api/purchases/admin/:id/payment-review` — confirms or rejects payment proof.
- `PATCH /api/purchases/admin/:id/status` — updates progress after payment is confirmed.
- `GET /api/purchases/admin/:id/messages` and `POST /api/purchases/admin/:id/messages` — read and send messages for an order.

Customer order chat endpoints are `GET /api/purchases/:id/messages` and `POST /api/purchases/:id/messages`. Supply the order access token in `X-Order-Access-Token`, or use the signed-in customer session for an order linked to that account.

Consultation requests remain at `/admin/orders` and do not become purchase transactions. No migration removes or changes existing consultation data.

## Customer accounts

Customers can register at `/register`, log in at `/login`, view their profile at `/akun`, and view purchase lists and details at `/akun/pesanan`. Direct web checkout requires a signed-in customer account; each order is linked to that account and can also be opened through its unique access token.

Customer authentication uses a signed session cookie that is `HttpOnly`, `SameSite=Lax`, and valid for 24 hours. Sessions recorded in `customer_sessions` can be revoked on logout. The customer cookie and role are not used by admin middleware.

Customers can start password recovery at `/lupa-password` using the security question registered on their account. A successful password reset revokes that customer's active sessions. Password recovery via WhatsApp is not available.

Customer registration also requires a security question and answer. From `/akun`, a signed-in customer can add or update the question after confirming the current password; this lets existing accounts enroll without losing account or order data. To recover with a security question, customers enter their email, select the question they chose during registration, and enter the answer. The server does not reveal the stored question before verification, so the customer must remember which question they chose. Answers are normalized and stored as bcrypt hashes. Verification allows five attempts per email and 30 per IP in a 15-minute window; a successful answer creates a one-time reset grant that expires after 10 minutes. A successful password reset revokes active customer sessions and any other unused reset grants. Security questions can be guessed or discovered elsewhere; customers should use an answer that is not publicly known.

The `customers` table stores profiles, bcrypt password hashes, security-question IDs, and bcrypt security-answer hashes; hashes are never returned by API responses. On server startup, the existing database is migrated by adding nullable security-question columns and creating reset-attempt/challenge tables; no manual SQL command is required. Existing customer accounts and order data are preserved; existing customers set a question from their signed-in profile. `purchase_orders.customer_id` links account orders to their owner; this value is always determined from the server session, not checkout input. Claiming a guest order requires its access token and an email address and WhatsApp number matching the account.

Customer account endpoints:

- `POST /api/customers/register` and `POST /api/customers/login` — validate data, hash passwords, and create sessions.
- `POST /api/customers/forgot-password/verify` and `POST /api/customers/forgot-password/reset` — verify the selected security question and answer, then use the short-lived reset grant to set a new password.
- `POST /api/customers/logout`, `GET /api/customers/me`, and `PATCH /api/customers/me` — revoke a session, read a profile, and update the signed-in customer's profile.
- `GET /api/customers/me/security-question` and `PUT /api/customers/me/security-question` — read or update the signed-in customer's question after confirming the current password.
- `GET /api/customers/orders` and `GET /api/customers/orders/:id` — list, filter, paginate, and view orders belonging to the active session.
- `POST /api/customers/claims/:id` — link a guest order after verifying its access token and contact information.
- `GET /api/customers/orders/:id/proofs/:proofId` — view proof after verifying ownership.

Proof is still submitted through `POST /api/purchases/:id/payment-proof`. Owners can submit or replace proof while awaiting payment, awaiting verification, or after a proof is rejected. Each version is stored privately in `purchase_payment_proofs`; older files are not deleted when proof is replaced. Only an admin can set the `paid` status after verifying receipt of funds.

`purchase_order_events` records actions that actually occurred, not predicted timeline steps. The schema migration adds customer, session, proof version, and order event tables, along with a nullable `customer_id` relationship, without deleting existing orders or consultations.

Local secrets are stored in `server/.env`. Do not add `.env` files to Git.
