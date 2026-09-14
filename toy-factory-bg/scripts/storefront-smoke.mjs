import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const origin = "http://127.0.0.1:3100";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100", "-H", "127.0.0.1"], { stdio: "ignore", env: { ...process.env, MESHY_API_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", SHOPIFY_STOREFRONT_PRIVATE_TOKEN: "", SHOPIFY_STOREFRONT_ACCESS_TOKEN: "", SHOPIFY_ADMIN_ACCESS_TOKEN: "" } });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 500)); }
  assert(ready, "Local production server did not start");
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process"] } : {}) });
  await mkdir("test-results", { recursive: true });
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    let creates = 0, complete = false;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/meshy/prototype") { creates++; return route.fulfill({ json: { taskId: "test-task-1234", accessToken: "test-token" } }); }
      if (url.pathname.startsWith("/api/meshy/task/")) return route.fulfill({ json: { id: "test-task-1234", status: complete ? "SUCCEEDED" : "PENDING", progress: 35, image_urls: ["/marketing/pop.svg"] } });
      if (url.pathname === "/api/shopify/checkout") return route.fulfill({ status: 503, json: { error: "Тестова временна грешка" } });
      if (url.pathname.startsWith("/api/")) return route.abort();
      return route.continue();
    });
    await page.goto(origin); await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Home overflow at ${width}`);
    await page.goto(`${origin}/create`);
    await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z2QAAAAASUVORK5CYII=", "base64") });
    await page.getByRole("checkbox").check();
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
    assert.equal(errors.length, 0, errors.join("\n"));
    await page.close(); console.log(`PASS storefront ${width}px: upload, resume without re-submit, preview, checkout error`);
  }
} finally { await browser?.close(); server.kill("SIGTERM"); }
