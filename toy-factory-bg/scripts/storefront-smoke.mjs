import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
const origin = "http://127.0.0.1:3100";
const adminSecret = "test-admin-secret-only-for-local-browser-123456789";
const fixture = { id: "11111111-1111-4111-8111-111111111111", status: "PRINTING", model_kind: "pop", prototype_task_id: "test-task", preview_url: null, size_cm: 15, price_eur: 69, shopify_order_name: "TEST-1001", customer_name: "Test Customer", paid_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", retry_count: 1, job_attempts: 5, last_operation: "archive-3mf" };
const database = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") { res.statusCode = 503; res.end('{"error":"No mutations in browser fixture"}'); return; }
  res.end(JSON.stringify(req.url.startsWith("/rest/v1/production_events") ? [{ id: 1, created_at: fixture.created_at, from_status: "READY_FOR_PRINT", to_status: "PRINTING", operation: "test", job_id: null }] : [fixture]));
});
await new Promise((resolve) => database.listen(3101, "127.0.0.1", resolve));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100", "-H", "127.0.0.1"], { stdio: "ignore", env: { ...process.env, ADMIN_SESSION_SECRET: adminSecret, MESHY_API_KEY: "", SUPABASE_URL: "http://127.0.0.1:3101", SUPABASE_SERVICE_ROLE_KEY: "local-fixture", SHOPIFY_STOREFRONT_PRIVATE_TOKEN: "", SHOPIFY_STOREFRONT_ACCESS_TOKEN: "", SHOPIFY_ADMIN_ACCESS_TOKEN: "", RESEND_API_KEY: "" } });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 500)); }
  assert(ready, "Local production server did not start");
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process", "--in-process-gpu", "--use-gl=angle", "--use-angle=swiftshader"] } : {}) });
  await mkdir("test-results", { recursive: true });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.unrouteAll();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    let creates = 0, complete = false;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/meshy/prototype") { creates++; return route.fulfill({ json: { taskId: "test-task-1234", accessToken: "test-token" } }); }
      if (url.pathname.startsWith("/api/meshy/task/")) return route.fulfill({ json: { id: "test-task-1234", status: complete ? "SUCCEEDED" : "PENDING", progress: 35, image_urls: ["/marketing/pop-card.svg"] } });
      if (url.pathname === "/api/shopify/checkout") return route.fulfill({ status: 503, json: { error: "Тестова временна грешка" } });
      if (url.pathname.startsWith("/api/")) return route.abort();
      return route.continue();
    });
    await page.goto(origin); await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Home overflow at ${width}`);
    await page.goto(`${origin}/create`);
    await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z2QAAAAASUVORK5CYII=", "base64") });
    await page.screenshot({ path: `test-results/upload-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: /ГЕНЕРИРАЙ МОЯТА/ }).click();
    await page.getByRole("progressbar").waitFor();
    await page.waitForFunction(() => Boolean(sessionStorage.getItem("popme-draft-v2")));
    complete = true; await page.reload();
    await page.getByRole("button", { name: /ПОРЪЧАЙ МОЯТА/ }).waitFor();
    assert.equal(creates, 1, "Refresh must not spend on another prototype");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Preview overflow at ${width}`);
    await page.screenshot({ path: `test-results/preview-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: /ПОРЪЧАЙ МОЯТА/ }).click();
    await page.getByText("Тестова временна грешка").first().waitFor();
    await page.goto(`${origin}/admin/dashboard`);
    assert(new URL(page.url()).pathname === "/admin", "Admin requires authentication");
    const payload = `admin:${Math.floor(Date.now()/1000)+3600}`;
    await page.context().addCookies([{ name: "toy_admin_session", value: `${payload}.${createHmac("sha256", adminSecret).update(payload).digest("hex")}`, url: origin }]);
    await page.goto(`${origin}/admin/dashboard`);
    await page.getByRole("link", { name: "Needs attention", exact: true }).waitFor();
    await page.screenshot({ path: `test-results/admin-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Admin overflow at ${width}`);
    await page.goto(`${origin}/admin/projects/${fixture.id}`);
    await page.getByRole("heading", { name: "История на проекта" }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Project overflow at ${width}`);
    await page.screenshot({ path: `test-results/project-${width}.png`, fullPage: true });
    await page.context().clearCookies();
    assert.equal(errors.length, 0, errors.join("\n"));
    await page.evaluate(() => sessionStorage.clear()); console.log(`PASS storefront ${width}px: upload, resume without re-submit, preview, checkout error`);
  }
} finally { await browser?.close(); server.kill("SIGTERM"); database.close(); }
