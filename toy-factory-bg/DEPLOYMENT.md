# Deployment, reconciliation and launch requirements

## Review boundary

Base reviewed: `8c5218f1f549860a5239220fcec51412876358f0` on `main`. Work is isolated on `astra/phase4-production-grade`. No production SQL, credentials, orders, Meshy calls, fulfillment, email, deployment or data deletion is part of this implementation session.

The branch intentionally disables Vercel Git deployment. The owner must separately approve a staging environment and later a production release. Keep the current POPME store; never use another merchant's Shopify credentials.

## SQL order — owner execution only

Take and verify a backup before any eventual production migration. Apply to an isolated staging database first. Fresh installation: start with `supabase/schema.sql`, then the following files. Existing installation: the numbered files can be repeated safely; apply the same list in this dependency order:

1. `supabase/20260830-production-hardening.sql`
2. `supabase/20260903-alerts-fulfillment.sql`
3. `supabase/20260903-print-palette.sql`
4. `supabase/20260904-retention.sql`
5. **New:** `supabase/20260913-production-safety.sql`
6. **New:** `supabase/20260914-production-jobs.sql`
7. **New:** `supabase/20260914-checkout-reservations.sql`
8. **New:** `supabase/20260914-prototype-submissions.sql`
9. **New:** `supabase/20260914-shopify-holds.sql`
10. **New:** `supabase/20260914-status-clock.sql`

The new code requires these columns/functions; deploy code only after schema readiness is verified. Do not restore `preview_url NOT NULL`: erased/expired projects intentionally have no preview. `consume_api_rate_limit` already granted service-role access in the old dated migration; the base schema has now been brought into agreement, with explicit denial to `anon` and `authenticated`.

Automated SQL tests use PGlite PostgreSQL: they apply the real files twice, include an existing row with the old NOT NULL constraint, then reapply the base schema. Only `create extension pgcrypto` is omitted in that test fixture because `gen_random_uuid()` is built in. This does not verify hosted Supabase configuration, Storage policies, PostgREST schema-cache refresh or network permissions.

Before enabling cron, inspect existing in-flight `*_SUBMITTING` projects against Meshy. A legacy submission may have reached the provider before its ID was stored; the new ledger cannot reconstruct that historical fact. The migration holds old submitting rows without a job ID for reconciliation instead of allowing blind submission. Legacy unpaid projects lack the expected variant snapshot and are deliberately held if paid after this upgrade.

## Environment configuration

New optional server-side values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PREVIEW_GLOBAL_HOURLY_LIMIT` | `30` | Global hourly preview request budget; per-IP limit remains 6/hour |
| `TOY_PRICE_10CM_EUR` | `49` | Server storefront price, must match existing Shopify 10 cm variant |
| `TOY_PRICE_15CM_EUR` | `69` | Same for 15 cm |
| `TOY_PRICE_20CM_EUR` | `89` | Same for 20 cm |

Existing required/recommended values now used more widely:

- `SITE_URL`: verified canonical HTTPS origin (no path); also used for signed Meshy asset inputs and callbacks. When absent the site is noindex, sitemap is empty and Product data is omitted.
- `ASSET_PROXY_SECRET`: dedicated random server secret recommended for signed asset and preview access. Existing `CRON_SECRET` / `MESHY_WEBHOOK_SECRET` fallback remains supported. Rotate deliberately; rotation expires active previews/links.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, private `SUPABASE_STORAGE_BUCKET`.
- Existing POPME `SHOPIFY_STORE_DOMAIN`, Storefront token, product handle or exact 10/15/20 cm variant GIDs, webhook secret, Admin token, API versions (current code defaults `2026-07`).
- `MESHY_API_KEY`, `MESHY_WEBHOOK_SECRET`, print palette and Bambu profile values.
- `ADMIN_PASSWORD`, random `ADMIN_SESSION_SECRET` (32+ characters), `CRON_SECRET`.
- `RESEND_API_KEY`, verified `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `WATCHDOG_STALE_MINUTES`.
- Keep `RETENTION_UNPAID_DAYS` / `RETENTION_PAID_DAYS` consistent with the approved privacy notice.

No variables were set or changed on Vercel. No legal/merchant values were guessed. `lib/legal.ts` remains the central inventory of missing merchant fields (`LAUNCH_BLOCKERS`), with processor location placeholders also requiring confirmation.

## Job semantics and capacity

- One heavy stage per request; one due project selected per minute by cron. A pending provider check schedules the project behind other due work. Horizontal invocations can claim different rows; a row cannot be held by two valid lease tokens.
- Worker deadline: 100 seconds; lease: 180 seconds. HTTP calls have shorter timeouts. Expired workers cannot overwrite a successor's row or release its lease.
- `job_attempts` counts claims (including polling/manual jobs); `retry_count` counts explicit new paid production attempts. Retry delay uses claim count and caps at one hour; frequent polling can therefore make the first later failure use the cap. A future dedicated queue worker may be appropriate as volume grows.
- Retention processes one project per hour, at most 24/day. Monitor backlog and increase scheduled invocation capacity before traffic exceeds that rate. Failed purges keep their pointers and retry. Provider-side Meshy data and Shopify accounting retention require separate owner procedures.
- GLB transfers and private downloads stream bounded chunks with backpressure. Individual assets are capped at 160 MiB; 3MF archive expansion is capped at 384 MiB / 2,048 entries. 3MF transformation is still in-process and materializes XML/ZIP data; representative largest-file memory and duration measurements on the actual Vercel plan remain mandatory.
- Preview submission reservations contain hashes/task IDs, no image payload, and expire through retention after 7 days. Prototype-consumption hashes remain after project erasure to prevent reuse; agree their security retention policy before launch.
- Watchdog age is based on `status_changed_at`, so polling cannot hide a stuck stage. Failed email sends keep `alert_sent_at` unset and back off. Resend requests use a payload-based idempotency key; provider deduplication lasts 24 hours, not forever. See [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Reconciliation — never blindly unlock

An operation with status `executing` or `unknown` may already have succeeded at the provider. Automatic retries are intentionally blocked; a new attempt could spend credits or duplicate fulfillment. There is no generic "ignore the hold" button.

1. Identify project, job, provider task/order and operation key from the dashboard and `production_operations`.
2. In the **same POPME provider account**, find the request and verify its inputs, task lineage, order line and outcome. Record evidence in the operator incident record; do not put secrets or photo URLs into logs.
3. For an accepted Meshy operation, a database owner can record the verified task ID as the operation's succeeded JSON string result and clear the project hold under a lock. Keep the submitting state so normal replay applies the recorded result. For an accepted cart, recover the actual cart/checkout information; do not fabricate a cart result object.
4. For fulfillment, confirm the exact Shopify line and tracking entry first. Record the verified fulfillment ID on the project and operation before clearing the hold. Never fulfill the whole Shopify order to repair a single figure.
5. Only when the provider proves no request was accepted may the database owner reset a reservation. This is an exceptional, reviewed repair; never delete an unknown operation merely because it is old.
6. Payment mismatches/refunds/cancellations require a commerce decision (correct payment, refund or cancellation) before production. Verify order hold records as well as the project's flag. Legacy projects need verified variant/line snapshots before release.

No such repairs or SQL mutations were executed in this session. Use a separate reviewed incident change for a concrete affected project; do not paste blanket unlock SQL into production.

## Launch blockers and residual risks

- Owner-approved staging and credentials for the **existing** POPME store, Supabase project, Meshy account, Vercel project and alert sender.
- Successful hosted migration dry run, confirmed private Storage/RLS, RPC rights and backup/restore exercise.
- Actual Shopify `2026-07` schema/scopes, line-level fulfillment, discount/tax/Markets behavior and HMAC delivery tests. GraphQL operations passed local validation against bundled `2026-04` schemas; this is not live `2026-07` validation.
- Automatic approval review rejected the Shopify validator that could upload repository-derived queries/telemetry to Shopify.dev. It was replaced with offline schema validation; no external validation is claimed. Further external validation requires explicit owner authorization.
- Representative 10/15/20 cm and POP/MINI/BRICK print samples, measured largest-file resources, palette and slicer verification. Translated component/build transforms are supported; rotations/scales are held for manual handling.
- Old ambiguous submissions and legacy checkout/fulfillment records require the reconciliation above.
- Confirm cron availability/frequency and the Vercel root directory; verify the branch deployment exclusion across all connected Vercel projects. Do not assume a green integration pill proves credentials work (it says configured).
- Merchant address, contact email/phone, VAT status, domain, production/delivery times, courier, privacy date and processor regions; legal review of personalization, complaints, international processing, browser storage and retention claims. Existing company name/EIK were preserved, not independently verified.
- Product imagery and marketing proof need owner approval. The damaged original POP bitmap has been replaced in UI references by the existing `pop-card.svg` illustration; no reviews, customer counts or new product-photo claims were added.
- Preview tokens expire in one hour; an existing Shopify cart can still be paid later and is validated by its project snapshot. Abandoned reserved carts lock the selected size. The UI explains conflicts; a multi-cart price-edit flow is intentionally not introduced.
- Shared admin password remains the existing authentication model. Per-user roles/MFA and signed Meshy webhook verification beyond the existing shared callback secret would be follow-up security work, requiring provider support/configuration.

## Release and rollback

Review the PR, run all automated checks and the staging checklist, then approve release separately. Additive schema can remain if app code is rolled back, but **old application workers must not run concurrently with this job model**: they do not honor leases. Pause incoming production scheduling and reconcile in-flight provider calls before a rollback. Never roll back by dropping new tables containing operation evidence or by restoring deleted assets.
