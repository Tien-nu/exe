# Vercel deployment of Tien-nu/exe

Repository: https://github.com/Tien-nu/exe

The application is a Next.js monorepo project. Import the repository into an authenticated Vercel account with these settings:

- Framework: Next.js.
- Root Directory: `dtc-starter/apps/storefront`.
- Include source files outside the Root Directory in the Build Step: enabled, to include `dtc-starter/pnpm-lock.yaml` and the pnpm workspace configuration.
- Node.js: 22.x.
- Build Command: `pnpm run build`.
- Install Command: `cd ../.. && pnpm install --frozen-lockfile --filter @dtc/storefront...`.
- Output Directory: Next.js default; do not select a static export directory.

Server rendering and API routes must run on Vercel Functions; this is not a static frontend deployment. No separate Render backend is needed in MongoDB mode. The build verifies the checked-in native admin assets when historical backend build directories are unavailable.

## Environment variables

Set these privately in Vercel; do not commit an environment export:

- `NEXT_PUBLIC_YARNLY_BACKEND_MODE=mongodb`
- `MONGODB_API_PREVIEW=true`
- `NEXT_PUBLIC_DEFAULT_REGION=vn`
- `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`: existing configured values.
- `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: existing configured values for image uploads.
- `CRON_SECRET`: existing configured value.
- `EMAIL_DELIVERY_ENABLED=false`: preserve the user's deferred email setup.
- `PAYMENT_MODE=bank`: create PayOS payment links for new customer orders.
- `QR_PAYMENT_BASE_URL`, `NEXT_PUBLIC_BASE_URL`: the final public HTTPS origin, never the local Wi-Fi address.
- `STOREFRONT_URL`: `https://exe201-rho.vercel.app/vn`, used for PayOS return and cancel URLs.
- `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`: server-only credentials from the PayOS payment channel.

Do not upload `SOURCE_DATABASE_URL` to Vercel; it belongs only to the read-only migration/export tooling. Do not upload local-only URLs or set `NODE_ENV=development` in production. SMTP credentials are not required while email delivery is disabled. Register `https://exe201-rho.vercel.app/api/payments/payos` as the PayOS webhook URL after deployment.

## Required verification after deployment

- Public storefront, store and product detail load with MongoDB data.
- Ward lists load from `/api/addresses/wards?province=hanoi`.
- `/app/orders` serves the native admin and its versioned assets.
- Customer/seller/admin routes preserve authentication protections.
- A new bank-mode order opens a PayOS checkout page and a payment-success webhook marks it paid.
- Image upload permissions and S3 bucket CORS allow the final origin.
- Atlas permits the deployment to connect. A successful local Atlas connection alone does not prove that Vercel can connect.

For Vercel Hobby, the user's chosen minute-level scheduler is an external service, not Vercel's daily Hobby cron. It must call the protected job endpoints with `Authorization: Bearer <CRON_SECRET>`; do not claim scheduled expiry/notifications/payouts are live before that scheduler is configured and verified.

Real bank receipt activation is documented separately in `HUONG-DAN-THANH-TOAN-THAT.md` and requires PayOS credentials, the registered webhook, a new bank-mode order and a user-performed transfer.
