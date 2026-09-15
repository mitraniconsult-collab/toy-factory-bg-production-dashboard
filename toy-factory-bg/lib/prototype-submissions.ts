import { createHash } from "node:crypto";
import { supabaseRest } from "@/lib/projects";
import { createPrototype, type ModelKind } from "@/lib/meshy";
import { PublicError } from "@/lib/http";
export async function submitPrototype(requestId: unknown, kind: ModelKind, image: string) {
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new PublicError("Невалиден идентификатор на заявка.");
  const hash = createHash("sha256").update(`${kind}:${image}`).digest("hex");
  const inserted = await supabaseRest("prototype_submissions?on_conflict=request_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ request_id: requestId, input_hash: hash }) });
  if (!inserted?.length) {
    const rows = await supabaseRest(`prototype_submissions?request_id=eq.${requestId}&select=input_hash,task_id`);
    if (rows?.[0]?.input_hash !== hash) throw new PublicError("Изображението е променено. Избери го отново.", 409);
    if (rows[0].task_id) return rows[0].task_id as string;
    throw new PublicError("Предишната заявка още се проверява. Не стартираме автоматично нова визуализация.", 409);
  }
  // No documented provider idempotency key: preserve an ambiguous reservation.
  const taskId = await createPrototype(kind, image);
  await supabaseRest(`prototype_submissions?request_id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ task_id: taskId }) });
  return taskId;
}
