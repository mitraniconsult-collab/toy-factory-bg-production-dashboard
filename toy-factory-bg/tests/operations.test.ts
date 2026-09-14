import { it, expect, vi } from "vitest";
import { ALLOWED_TRANSITIONS } from "@/lib/operations";
import { listProjects } from "@/lib/projects";
it("requires printing then packing before shipping", () => {
  expect(ALLOWED_TRANSITIONS.READY_FOR_PRINT).not.toContain("SHIPPED");
  expect(ALLOWED_TRANSITIONS.PRINTING).toContain("PRINTED");
  expect(ALLOWED_TRANSITIONS.PRINTED).toContain("PACKED");
  expect(ALLOWED_TRANSITIONS.PACKED).toContain("SHIPPED");
  expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual(["CANCELLED"]);
});
it("combines issue and search filters with pagination", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("[]")); vi.stubGlobal("fetch", fetcher);
  await listProjects({ q: "Customer", issue: "any", page: 3, style: "mini", size: "15" });
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("offset")).toBe("50");
  expect(url.searchParams.get("limit")).toBe("26");
  expect(url.searchParams.get("model_kind")).toBe("eq.mini");
  expect(url.searchParams.get("and")).toContain("automation_blocked.eq.true");
  expect(url.searchParams.get("and")).toContain("customer_name.ilike.*Customer*");
});
