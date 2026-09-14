import { beforeEach, afterEach, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://database.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "test-webhook-secret");
  vi.stubEnv("SHOPIFY_STORE_DOMAIN", "toy-test.myshopify.com");
  vi.stubEnv("MESHY_API_KEY", "test-meshy-key");
  vi.stubEnv("NEXT_PUBLIC_MOCK_AI", "false");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request: external services must be mocked"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
