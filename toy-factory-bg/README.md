# POPME — storefront and production operations

Next.js application for personalized POP, MINI and BRICK figures in **10 / 15 / 20 cm**. Continue using the existing POPME Shopify store and Supabase project; do not substitute another business's credentials.

This branch is prepared for review and staging. It is **not a production deployment or evidence of live provider verification**. See [deployment and launch requirements](DEPLOYMENT.md), [test checklist](TEST-CHECKLIST.md) and [change report](CHANGE-REPORT.md).

## Development and checks

Node 22 (CI) or a compatible current Node runtime. From `toy-factory-bg/`:

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm audit --audit-level=high
```

The unit tests reject unexpected network fetches. Browser checks start a local production server and a local database fixture, intercept prototype/poll/checkout requests, and clear provider credentials. They never create a real order, send an email or spend Meshy credits. `NEXT_PUBLIC_MOCK_AI=true` disables both prototype submissions and checkout; UI tests use request mocks instead.

## Flow

1. Upload and consent → authenticated, rate-limited Meshy prototype.
2. Preview approval → server validates the configured price against the existing Shopify variant.
3. An atomic prototype reservation creates at most one project/cart; repeat checkout returns its existing URL. Size is fixed once that cart is created.
4. Raw-body Shopify HMAC + shop domain + paid status + exact project line/quantity/variant/style/size/EUR price checks.
5. One leased production stage per invocation: build → resize → archive private GLB → multi-color 3MF → exact millimetre scaling and private archive.
6. Admin: READY_FOR_PRINT → PRINTING → PRINTED → PACKED → SHIPPED. Fulfillment targets the validated Shopify line only.

The paid webhook only records/enqueues work. Cron runs one due project per minute; Meshy terminal callbacks can advance a project as well. A lease token fences writes, with a 180-second lease and a 100-second job deadline. Transient failures use exponential retry delays (30 seconds to one hour). Provider submissions have a durable operation record: ambiguous outcomes stop automatic submission and require reconciliation.

## Main code

- `components/builder/`: state reducer, upload preparation, resumable task/session logic and step components.
- `lib/catalog.ts`: server-owned EUR prices, preserving the original 49 / 69 / 89 defaults. Checkout fails closed if Shopify disagrees.
- `lib/production.ts`, `lib/jobs.ts`, `lib/job-context.ts`: production stages, leases, operation replay and retry controls.
- `lib/paid-order.ts`, `app/api/shopify/`: payment validation and webhook handling, including out-of-order cancellation/refund holds.
- `lib/storage.ts`, `lib/three-mf.ts`, `lib/retention.ts`: private bounded asset transfer, exact scaling and cleanup.
- `app/admin/`: six work queues, combined filters, pagination, event timeline, job/retry details and safe physical-stage bulk actions.
- `supabase/`: base schema and repeatable migration files. **Read DEPLOYMENT.md before applying any SQL.**

## Security and retention

`proxy.ts` and per-route checks retain admin authentication. Public task polling requires an expiring preview token. Private GLB/3MF downloads require admin access or an expiring signed asset URL. Service credentials remain on the server. Database RPC permissions are restricted to `service_role`.

Retention handles one project per hourly invocation: unpaid assets after 7 days, closed order assets after 90 days by default. Purge blocks automation, removes known chunks (including interrupted-upload remnants), and marks completion only after cleanup succeeds. GDPR erasure additionally deletes the project and cascading event/operation records. Shopify records and provider-side data have separate retention procedures.

Photos in browser IndexedDB have a one-hour expiry checked on the next visit; a closed browser cannot run cleanup. Preview task metadata remains small in sessionStorage. Browser quota failures are surfaced without discarding the current in-memory result.

## Deployment boundary

The branch `astra/phase4-production-grade` is disabled for Vercel Git deployments in both repository and project configuration. No production variables or data are changed by this PR. Verify the configured Vercel project root is `toy-factory-bg/`, approve staging first, and do not merge until the launch checklist is resolved.
