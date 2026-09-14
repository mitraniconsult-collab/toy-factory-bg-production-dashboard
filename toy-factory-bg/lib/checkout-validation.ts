import { isModelKind } from "@/lib/projects";
import { PublicError } from "@/lib/http";
export function validateCheckout(body: Record<string, unknown>) {
  if (typeof body.prototypeTaskId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(body.prototypeTaskId)) throw new PublicError("Невалидна визуализация.");
  if (body.size !== "10" && body.size !== "15" && body.size !== "20") throw new PublicError("Невалиден размер.");
  if (!isModelKind(body.modelKind)) throw new PublicError("Невалиден стил.");
  return { prototypeTaskId: body.prototypeTaskId, size: body.size as "10" | "15" | "20", modelKind: body.modelKind };
}
