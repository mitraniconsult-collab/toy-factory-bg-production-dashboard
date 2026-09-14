import { isModelKind, type ModelKind } from "./image";
export type Draft = { taskId: string; accessToken: string; modelKind: ModelKind; regenerations: number; expiresAt: number };
const KEY = "popme-draft-v2";
export function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!d || typeof d.taskId !== "string" || typeof d.accessToken !== "string" || !isModelKind(d.modelKind) || !Number.isFinite(d.expiresAt) || d.expiresAt <= Date.now()) return null;
    return d;
  } catch { return null; }
}
export function writeDraft(draft: Draft | null) {
  try { if (draft) sessionStorage.setItem(KEY, JSON.stringify(draft)); else sessionStorage.removeItem(KEY); return true; }
  catch { return false; }
}
// Photos live in IndexedDB, never a multi-megabyte sessionStorage string.
export async function photoStore(value?: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 1500);
    try {
      const open = indexedDB.open("popme-draft", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("photo");
      open.onerror = () => { clearTimeout(timeout); resolve(null); };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("photo", "readwrite");
        const store = tx.objectStore("photo");
        const req = value === undefined ? store.get("current") : value === null ? store.delete("current") : store.put({ value, expiresAt: Date.now() + 3600000 }, "current");
        let result: string | null = null;
        req.onsuccess = () => { if (value === undefined && req.result?.expiresAt > Date.now()) result = req.result.value; else if (typeof value === "string") result = value; else if (value === undefined) store.delete("current"); };
        tx.oncomplete = () => { clearTimeout(timeout); db.close(); resolve(result); };
        tx.onerror = () => { clearTimeout(timeout); db.close(); resolve(null); };
      };
    } catch { clearTimeout(timeout); resolve(null); }
  });
}
