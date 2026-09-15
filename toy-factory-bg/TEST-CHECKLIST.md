# Staging and launch checklist

Unchecked items require owner execution/credentials; they are not proof of completed live tests. No real Meshy credits, Shopify orders, production migrations or deployments are authorized by this checklist itself.

## Automated checks

- [x] Typecheck, unit tests, production build and dependency audit run locally.
- [x] SQL files exercised repeatedly against a fresh/local existing-row PostgreSQL fixture; retention nullability, RPC permissions, leases and timeline verified.
- [x] HMAC, signed access, rate-limit allow/deny/fail-closed, duplicate paid webhook, quantity/variant/style/size/currency/price checks, Meshy terminal transitions and exact 100/150/200 mm 3MF geometry.
- [x] Unknown operation/preview submission cannot silently resubmit; stored result replay avoids new provider calls.
- [x] Purge failures keep row/failed pointers, completed purge clears nullable URLs; watchdog failure never stamps success.
- [x] Builder state/expiry/storage quota tests; browser storefront flow at 360/768/1440 with mocked APIs and refresh without a second prototype submission.
- [ ] PR GitHub Actions run verified green (see PR checks for actual status).

## Hosted staging E2E (owner approval first)

1. Provision/approve an isolated staging Supabase database; apply the files in DEPLOYMENT.md order. Confirm service_role-only RPC execution, private bucket and denied anon/authenticated access.
2. Configure the approved POPME staging environment and store/test gateway without changing another business's store or a live payment gateway. Confirm Headless product publication and exact 10/15/20 cm variant/price mappings.
3. Keep Meshy and email mock adapters in automated staging tests. A real Meshy smoke test or Shopify test checkout requires a separate explicit approval; agree budget and test-recipient email first.
4. Upload a permitted synthetic image, consent, start preview, refresh while pending, receive result and refresh its URL. Test expired preview token, unavailable browser storage, failed/expired Meshy task, polling timeout and retry. No new prototype on polling retry.
5. Approve preview and select each size. Repeat checkout concurrently: same project/cart; another size conflicts. Modify a client-sent price or variant and confirm the server rejects it.
6. Deliver signed synthetic orders/paid with the approved snapshot. Duplicate delivery yields one paid project and no inline provider submission. Wrong HMAC/shop, quantity 2, duplicated project properties, variant/style/size/currency/price mismatch and discounts never start production.
7. Send cancellation/refund before paid and during each stage. Check stored order hold prevents further automated stages. Physical production needs an operator decision.
8. Run two concurrent claims; only one wins. Interrupt a worker, advance its lease expiry and retry. Replay a stored task result; simulate provider-accepted/response-lost and confirm an operator hold instead of another charge.
9. Mock build → resize → private GLB → print → archived 3MF. Verify task IDs, event history, retry counters, signed URLs, expired-link denial, chunk download backpressure and exact height/palette in the slicer.
10. Complete PRINTING → PRINTED → PACKED. Test individual and bulk repeated actions and stale selections. Require tracking for SHIPPED. Simulate fulfillment failure and accepted/lost response; never fulfill other order lines. Notification requested must not be presented as confirmed email delivery.
11. Simulate Resend failure/recovery and a long-pending Meshy task. Watchdog must retain the failed alert and detect stale status even while polling continues.
12. On disposable test projects only: age unpaid and closed rows, run retention, inject partial Storage deletion failure, retry, then GDPR erase. Verify no surviving deterministic chunks; inspect cascading events/operations and retained anti-reuse digest policy. Do not touch customer records.
13. At 360/768/1440 px: test keyboard upload (Enter and Space), labels, focus movement, progress announcements, reduced motion, contrast, queues, pagination and timeline. Test actual Safari/iOS as well as Chromium.
14. Confirm canonical origin, sitemap, robots exclusions, OG image, Product structured data, and absence of placeholder legal details or unverified claims before opening the storefront.
15. Record real duration and peak memory for representative largest assets on the intended Vercel plan. Demonstrate backup/restore and rollback while scheduling is paused.

## Production approval

- [ ] All launch blockers in DEPLOYMENT.md resolved with evidence.
- [ ] Existing ambiguous jobs/legacy checkout snapshots reconciled.
- [ ] Owner reviews and approves PR merge.
- [ ] Owner approves production migration/release separately.
- [ ] Confirm live checkout/payment mode and monitor first production order, cron backlog, held jobs and alerts.
