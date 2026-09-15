import type { ToyProject } from "@/lib/projects";
export type PaidLine = { id?: string | number; variant_id?: string | number; quantity?: number; price?: string; discount_allocations?: Array<{ amount?: string }>; properties?: Array<{ name?: string; value?: string }> };
export function validatePaidLine(p: ToyProject, lines: PaidLine[], currency?: string): string | null {
  if (lines.length !== 1 || lines[0].quantity !== 1) return "Order quantity must be exactly one per project";
  const line = lines[0];
  if (!p.expected_variant_id || p.expected_variant_id !== `gid://shopify/ProductVariant/${line.variant_id}`) return "Shopify variant does not match checkout (legacy orders require review)";
  const property = (name: string) => line.properties?.filter((x) => x.name === name);
  if (property("Style")?.length !== 1 || property("Style")?.[0].value !== p.model_kind.toUpperCase()) return "Style mismatch";
  if (property("Size")?.length !== 1 || property("Size")?.[0].value !== `${p.size_cm} cm`) return "Size mismatch";
  if (currency !== "EUR") return "Currency mismatch";
  const cents = (value: unknown) => typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : NaN;
  if (cents(line.price) !== Math.round(Number(p.price_eur) * 100)) return "Paid price mismatch";
  // No silent policy change for discounted orders: operator verifies before production.
  if (line.discount_allocations?.some((d) => cents(d.amount) !== 0)) return "Discounted order requires operator review";
  if (!line.id) return "Missing Shopify line item";
  return null;
}
