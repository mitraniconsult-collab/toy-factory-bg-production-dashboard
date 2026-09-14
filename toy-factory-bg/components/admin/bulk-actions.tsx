"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function BulkActions({ projects }: { projects: Array<{ id: string; status: string; label: string }> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  if (!projects.length) return null;
  async function run(status: string) {
    if (!confirm(`Потвърждаваш ли ${status} за ${selected.length} избрани фигурки?`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/projects/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected, status }), signal: AbortSignal.timeout(90000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Грешка при запис");
      const failed = data.results.filter((r: { ok: boolean }) => !r.ok).length;
      setMessage(failed ? `${failed} проекта не са променени. Обнови и прегледай статуса им.` : "Промените са записани.");
      setSelected([]); router.refresh();
    } catch { setMessage("Провери актуалните статуси преди следващ опит."); }
    finally { setBusy(false); }
  }
  return <details className="admin-bulk"><summary>Групово отбелязване на печат / опаковане</summary><p>Избери до 20 проекта. При променен статус действието се пропуска.</p><div className="bulk-options">{projects.map((p) => <label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} disabled={busy || (!selected.includes(p.id) && selected.length >= 20)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))} />{p.label} · {p.status}</label>)}</div><button className="admin-button secondary" disabled={busy || !selected.length} onClick={() => run("PRINTED")}>Печатът е завършен</button> <button className="admin-button secondary" disabled={busy || !selected.length} onClick={() => run("PACKED")}>Опаковано</button><p role="status">{message}</p></details>;
}
