# Change and verification report

## Verified locally

- Base main: `8c5218f1f549860a5239220fcec51412876358f0`; re-fetched before PR preparation and unchanged.
- `npm install` baseline and `npm ci` final clean install: passed; lockfile committed.
- `npx tsc --noEmit` and `npm run typecheck`: passed.
- `npm test`: **43 tests in 12 files passed** (all service calls mocked).
- `npm run build`: passed on Next.js **16.3.5**.
- `npm audit`: **0 vulnerabilities** at the final clean-install check.
- Browser smoke: storefront and authenticated fixture admin at **360 / 768 / 1440 px**; no horizontal page overflow; upload, refresh/resume without a second prototype, preview, checkout error, auth redirect, queues and event timeline passed.
- Five Shopify GraphQL operations passed **offline** validation against bundled **2026-04** Admin/Storefront schemas. Live 2026-07 validation was not performed.
- SQL migration replay, nullable purge, service-only rate RPC, lease contention/expiry and event recording passed in PGlite. Hosted Supabase is not tested.
- `git diff --check`: passed.

Browser evidence is generated under ignored `test-results/` by `npm run test:browser`. Local Chromium CDN downloads timed out; a locally extracted Chromium package was used through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. CI installs the standard Playwright Chromium. These screenshots use only synthetic/fixture data and existing illustrations; they do not demonstrate real AI output or physical print quality.

## Not claimed as complete

- GitHub-hosted CI completion: inspect the PR's checks; a configured workflow is not proof of a green remote run.
- Live Shopify/Meshy/Supabase/Vercel/Resend integration, production deployment, migrations or physical prints.
- Real iOS/Safari accessibility and largest-file memory/latency testing.
- Owner legal details, data processor agreements, legacy-job reconciliation and production sign-off.

See [DEPLOYMENT.md](DEPLOYMENT.md) for all six new migrations, environment configuration, reconciliation and launch blockers. See [TEST-CHECKLIST.md](TEST-CHECKLIST.md) for the staging E2E scenario. No production data was deleted. The seven old layered CSS files were consolidated with their original contents/cascade preserved in `app/storefront.css`; previous files remain recoverable through git history.

## Changed files relative to main

A = added, M = modified, D = removed, R = renamed. Includes this report.

| Change | Repository-relative path |
| --- | --- |
| A | `.github/workflows/ci.yml` |
| M | `toy-factory-bg/.env.example` |
| M | `toy-factory-bg/.gitignore` |
| A | `toy-factory-bg/DEPLOYMENT.md` |
| M | `toy-factory-bg/README.md` |
| M | `toy-factory-bg/TEST-CHECKLIST.md` |
| A | `toy-factory-bg/app/accessibility.css` |
| M | `toy-factory-bg/app/admin/dashboard/page.tsx` |
| M | `toy-factory-bg/app/admin/projects/[id]/page.tsx` |
| M | `toy-factory-bg/app/api/admin/login/route.ts` |
| M | `toy-factory-bg/app/api/admin/projects/[id]/asset/route.ts` |
| M | `toy-factory-bg/app/api/admin/projects/[id]/preview/route.ts` |
| M | `toy-factory-bg/app/api/admin/projects/[id]/regenerate-3mf/route.ts` |
| M | `toy-factory-bg/app/api/admin/projects/[id]/retry/route.ts` |
| M | `toy-factory-bg/app/api/admin/projects/[id]/status/route.ts` |
| A | `toy-factory-bg/app/api/admin/projects/bulk/route.ts` |
| M | `toy-factory-bg/app/api/assets/private/route.ts` |
| M | `toy-factory-bg/app/api/cron/retention/route.ts` |
| M | `toy-factory-bg/app/api/meshy/prototype/route.ts` |
| M | `toy-factory-bg/app/api/meshy/task/[stage]/[id]/route.ts` |
| M | `toy-factory-bg/app/api/meshy/webhook/route.ts` |
| M | `toy-factory-bg/app/api/shopify/checkout/route.ts` |
| M | `toy-factory-bg/app/api/shopify/webhooks/orders-cancelled/route.ts` |
| M | `toy-factory-bg/app/api/shopify/webhooks/orders-paid/route.ts` |
| M | `toy-factory-bg/app/create/page.tsx` |
| M | `toy-factory-bg/app/create/preview/page.tsx` |
| M | `toy-factory-bg/app/layout.tsx` |
| A | `toy-factory-bg/app/opengraph-image.tsx` |
| A | `toy-factory-bg/app/operations.css` |
| M | `toy-factory-bg/app/page.tsx` |
| D | `toy-factory-bg/app/popme-clean.css` |
| D | `toy-factory-bg/app/popme-legal.css` |
| D | `toy-factory-bg/app/popme-mobile-gruns.css` |
| D | `toy-factory-bg/app/popme-storefront-v2.css` |
| D | `toy-factory-bg/app/popme-v2.css` |
| D | `toy-factory-bg/app/popme-v3.css` |
| D | `toy-factory-bg/app/popme.css` |
| A | `toy-factory-bg/app/robots.ts` |
| A | `toy-factory-bg/app/sitemap.ts` |
| A | `toy-factory-bg/app/storefront.css` |
| M | `toy-factory-bg/components/admin/admin-actions.tsx` |
| A | `toy-factory-bg/components/admin/bulk-actions.tsx` |
| A | `toy-factory-bg/components/builder/image.ts` |
| A | `toy-factory-bg/components/builder/machine.ts` |
| A | `toy-factory-bg/components/builder/preview-step.tsx` |
| A | `toy-factory-bg/components/builder/progress.tsx` |
| A | `toy-factory-bg/components/builder/session.ts` |
| A | `toy-factory-bg/components/builder/upload-step.tsx` |
| A | `toy-factory-bg/components/builder/use-builder.ts` |
| M | `toy-factory-bg/components/toy-builder.tsx` |
| M | `toy-factory-bg/lib/alerts.ts` |
| A | `toy-factory-bg/lib/catalog.ts` |
| A | `toy-factory-bg/lib/checkout-validation.ts` |
| A | `toy-factory-bg/lib/http.ts` |
| A | `toy-factory-bg/lib/job-context.ts` |
| A | `toy-factory-bg/lib/jobs.ts` |
| M | `toy-factory-bg/lib/legal.ts` |
| M | `toy-factory-bg/lib/meshy.ts` |
| A | `toy-factory-bg/lib/operations.ts` |
| A | `toy-factory-bg/lib/paid-order.ts` |
| A | `toy-factory-bg/lib/preview-access.ts` |
| M | `toy-factory-bg/lib/production.ts` |
| M | `toy-factory-bg/lib/project-assets.ts` |
| M | `toy-factory-bg/lib/projects.ts` |
| A | `toy-factory-bg/lib/prototype-submissions.ts` |
| M | `toy-factory-bg/lib/rate-limit.ts` |
| M | `toy-factory-bg/lib/retention.ts` |
| M | `toy-factory-bg/lib/shopify-admin.ts` |
| M | `toy-factory-bg/lib/shopify-webhook.ts` |
| M | `toy-factory-bg/lib/shopify.ts` |
| A | `toy-factory-bg/lib/site.ts` |
| M | `toy-factory-bg/lib/storage.ts` |
| M | `toy-factory-bg/lib/three-mf.ts` |
| M | `toy-factory-bg/lib/watchdog.ts` |
| M | `toy-factory-bg/next-env.d.ts` |
| A | `toy-factory-bg/package-lock.json` |
| M | `toy-factory-bg/package.json` |
| R086 | `toy-factory-bg/middleware.ts` → `toy-factory-bg/proxy.ts` |
| A | `toy-factory-bg/scripts/storefront-smoke.mjs` |
| A | `toy-factory-bg/supabase/20260913-production-safety.sql` |
| A | `toy-factory-bg/supabase/20260914-checkout-reservations.sql` |
| A | `toy-factory-bg/supabase/20260914-production-jobs.sql` |
| A | `toy-factory-bg/supabase/20260914-prototype-submissions.sql` |
| A | `toy-factory-bg/supabase/20260914-shopify-holds.sql` |
| A | `toy-factory-bg/supabase/20260914-status-clock.sql` |
| M | `toy-factory-bg/supabase/schema.sql` |
| A | `toy-factory-bg/tests/builder.test.ts` |
| A | `toy-factory-bg/tests/database.test.ts` |
| A | `toy-factory-bg/tests/fixtures.ts` |
| A | `toy-factory-bg/tests/jobs.test.ts` |
| A | `toy-factory-bg/tests/operations.test.ts` |
| A | `toy-factory-bg/tests/paid-order.test.ts` |
| A | `toy-factory-bg/tests/production.test.ts` |
| A | `toy-factory-bg/tests/prototype-submissions.test.ts` |
| A | `toy-factory-bg/tests/retention.test.ts` |
| A | `toy-factory-bg/tests/routes.test.ts` |
| A | `toy-factory-bg/tests/security.test.ts` |
| A | `toy-factory-bg/tests/setup.ts` |
| A | `toy-factory-bg/tests/three-mf.test.ts` |
| A | `toy-factory-bg/tests/watchdog.test.ts` |
| M | `toy-factory-bg/tsconfig.json` |
| M | `toy-factory-bg/vercel.json` |
| A | `toy-factory-bg/vitest.config.mts` |
| A | `vercel.json` |
| A | `toy-factory-bg/CHANGE-REPORT.md` |

