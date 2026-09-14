import { it, expect, vi } from "vitest";
import { builderReducer, initialState } from "@/components/builder/machine";
import { readDraft, writeDraft } from "@/components/builder/session";
it("permits checkout only after preview approval", () => {
  expect(builderReducer(initialState, { type: "CHECKOUT" })).toEqual(initialState);
  const preview = builderReducer(initialState, { type: "READY" });
  expect(builderReducer(preview, { type: "CHECKOUT" }).phase).toBe("checkout");
});
it("keeps timeout distinct from a provider failure and bounds progress", () => {
  const active = builderReducer(initialState, { type: "START" });
  expect(builderReducer(active, { type: "PROGRESS", value: 150 }).progress).toBe(100);
  expect(builderReducer(active, { type: "TIMEOUT", message: "wait" }).phase).toBe("timeout");
});
it("survives blocked or full session storage", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } });
  expect(readDraft()).toBeNull();
  expect(writeDraft({ taskId: "test", accessToken: "token", modelKind: "pop", expiresAt: Date.now()+1000, regenerations: 0 })).toBe(false);
});
it("does not restore expired previews", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify({ taskId: "test", accessToken: "token", modelKind: "pop", expiresAt: 0 }) });
  expect(readDraft()).toBeNull();
});
