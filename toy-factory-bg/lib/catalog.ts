/** Server-owned product configuration; checkout verifies the same prices with Shopify. */
export type CatalogItem = { size: "10" | "15" | "20"; price: number };
export function getCatalog(): CatalogItem[] {
  return ([{ size: "10", price: 49 }, { size: "15", price: 69 }, { size: "20", price: 89 }] as CatalogItem[]).map((item) => {
    const price = Number(process.env[`TOY_PRICE_${item.size}CM_EUR`] || item.price);
    if (!Number.isFinite(price) || price <= 0 || Math.round(price * 100) !== price * 100) throw new Error("Invalid product price configuration");
    return { ...item, price };
  });
}
