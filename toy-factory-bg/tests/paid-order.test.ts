import { it, expect } from "vitest";
import { validatePaidLine, type PaidLine } from "@/lib/paid-order";
import { project } from "./fixtures";
const p = project({ expected_variant_id: "gid://shopify/ProductVariant/123" });
const line: PaidLine = { id: 10, variant_id: 123, quantity: 1, price: "49.00", properties: [{ name: "Style", value: "POP" }, { name: "Size", value: "10 cm" }] };
it("accepts the exact purchased project", () => expect(validatePaidLine(p, [line], "EUR")).toBeNull());
it.each([{ quantity: 2 }, { variant_id: 124 }, { price: "0.49" }, { properties: [] }, { discount_allocations: [{ amount: "1" }] }])("holds mismatched purchase %j", (patch) => expect(validatePaidLine(p, [{ ...line, ...patch }], "EUR")).not.toBeNull());
it("rejects currency and duplicated lines", () => {
  expect(validatePaidLine(p, [line], "USD")).not.toBeNull();
  expect(validatePaidLine(p, [line, line], "EUR")).not.toBeNull();
});
