import { NextResponse } from "next/server";
export class PublicError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function readJson(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  if (!request.body) throw new PublicError("Липсват данни.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > maxBytes) throw new PublicError("Заявката е твърде голяма.", 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) { if (error instanceof PublicError) throw error; throw new PublicError("Невалидна заявка."); }
  finally { await reader.cancel().catch(() => undefined); }
}
export function publicFailure(error: unknown) {
  if (error instanceof PublicError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(JSON.stringify({ event: "public_request_failed", kind: error instanceof Error ? error.name : "unknown" }));
  return NextResponse.json({ error: "Услугата е временно недостъпна. Опитай отново малко по-късно." }, { status: 503 });
}
