import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTask } from "@/lib/meshy";
import { supabaseRest, updateProject, type ToyProject } from "@/lib/projects";
import { createToyCheckout, resolveVariant } from "@/lib/shopify";
import { archiveRemoteAsset } from "@/lib/storage";
import { validateCheckout } from "@/lib/checkout-validation";
import { readJson, PublicError, publicFailure } from "@/lib/http";
import { verifyPreviewAccess } from "@/lib/preview-access";
import { consumeRateLimit, requestClientKey } from "@/lib/rate-limit";
import { externalOperation, withProjectJob, JobBusyError } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const { prototypeTaskId, size, modelKind } = validateCheckout(body);
    if (process.env.NEXT_PUBLIC_MOCK_AI === "true") throw new PublicError("Плащането е изключено в демо режим.", 403);
    if (!verifyPreviewAccess(modelKind, prototypeTaskId, body.accessToken)) throw new PublicError("Визуализацията е изтекла. Създай нова.", 401);
    const rate = await consumeRateLimit({ scope: "checkout", key: requestClientKey(request), limit: 10, windowSeconds: 3600 });
    if (!rate.allowed) return NextResponse.json({ error: "Твърде много опити. Опитай по-късно." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((Date.parse(rate.resetAt) - Date.now()) / 1000))) } });
    const task = await getTask(modelKind, "prototype", prototypeTaskId);
    const preview = task.image_urls?.[0] || task.thumbnail_url;
    if (task.status !== "SUCCEEDED" || !preview) throw new PublicError("Визуализацията още не е готова.", 409);
    const buyerIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const variant = await resolveVariant(size, buyerIp);
    const price = Number(variant.price.amount);
    if (!Number.isFinite(price) || price < 0 || variant.price.currencyCode !== "EUR") throw new Error("Invalid EUR variant price");
    const digest = createHash("sha256").update(`${modelKind}:${prototypeTaskId}`).digest("hex");
    const rows = await supabaseRest("rpc/reserve_toy_checkout", { method: "POST", body: JSON.stringify({ p_hash: digest, p_project: { id: randomUUID(), model_kind: modelKind, prototype_task_id: prototypeTaskId, preview_url: preview, size_cm: Number(size), price_eur: price, expected_variant_id: variant.id } }) }) as ToyProject[];
    const reserved = rows[0];
    if (!reserved || reserved.assets_purged_at || reserved.paid_at || reserved.automation_blocked) throw new PublicError("Тази визуализация вече е използвана или изтекла.", 409);
    if (reserved.size_cm !== Number(size)) throw new PublicError("Вече има поръчка с друг размер за тази визуализация.", 409);
    if (reserved.checkout_url) return NextResponse.json({ projectId: reserved.id, checkoutUrl: reserved.checkout_url });
    const result = await withProjectJob(reserved.id, async (p) => {
      if (p.checkout_url) return { projectId: p.id, checkoutUrl: p.checkout_url };
      if (p.automation_blocked) throw new PublicError("Поръчката изисква проверка. Опитай по-късно.", 409);
      const path = p.preview_storage_path || await archiveRemoteAsset({ projectId: p.id, sourceUrl: preview, filename: "preview" });
      await updateProject(p.id, { preview_storage_path: path });
      const cart = await externalOperation(p, "shopify-cart", "initial", () => createToyCheckout({ size, style: modelKind, projectId: p.id, buyerIp, resolvedVariant: { id: p.expected_variant_id!, price: { amount: String(p.price_eur), currencyCode: "EUR" } } }));
      await updateProject(p.id, { status: "CHECKOUT_CREATED", checkout_url: cart.checkoutUrl, shopify_cart_id: cart.cartId, last_error: null });
      return { projectId: p.id, checkoutUrl: cart.checkoutUrl };
    }, true);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof JobBusyError) return NextResponse.json({ error: "Поръчката се подготвя. Опитай отново след малко." }, { status: 409 });
    return publicFailure(error);
  }
}
