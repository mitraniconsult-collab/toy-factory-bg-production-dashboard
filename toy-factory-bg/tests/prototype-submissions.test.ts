import { it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("@/lib/projects", () => ({ supabaseRest: vi.fn() }));
vi.mock("@/lib/meshy", () => ({ createPrototype: vi.fn() }));
import { supabaseRest } from "@/lib/projects";
import { createPrototype } from "@/lib/meshy";
import { submitPrototype } from "@/lib/prototype-submissions";
const id = "11111111-1111-4111-8111-111111111111";
it("does not repeat an ambiguous preview submission", async () => {
  vi.mocked(supabaseRest).mockResolvedValueOnce([]).mockResolvedValueOnce([{ input_hash: createHash("sha256").update("pop:image").digest("hex"), task_id: null }]);
  await expect(submitPrototype(id, "pop", "image")).rejects.toThrow("Предишната заявка");
  expect(createPrototype).not.toHaveBeenCalled();
});
it("returns a recorded preview result", async () => {
  vi.mocked(supabaseRest).mockResolvedValueOnce([]).mockResolvedValueOnce([{ input_hash: createHash("sha256").update("pop:image").digest("hex"), task_id: "task" }]);
  expect(await submitPrototype(id, "pop", "image")).toBe("task");
  expect(createPrototype).not.toHaveBeenCalled();
});
