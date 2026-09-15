"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { MANUAL_PRODUCTION_STATUSES, STATUS_META } from "@/lib/status";
import { ProjectStatus } from "@/lib/projects";
import { ALLOWED_TRANSITIONS } from "@/lib/operations";

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(115_000),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

export function SyncAllButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!confirm("Провери един чакащ проект. Следващата стъпка може да използва Meshy кредити. Продължи?")) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/admin/sync");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-inline-action">
      <button className="admin-button secondary" onClick={run} disabled={busy}>
        {busy ? "Синхронизирам…" : "Обработи следващ проект"}
      </button>
      {error && <span className="admin-inline-error">{error}</span>}
    </div>
  );
}

export function ProjectActions({
  projectId,
  status,
  notes,
  trackingNumber,
  trackingCompany,
  fulfillmentId,
  canRegenerateThreeMf = false,
  blocked = false,
}: {
  projectId: string;
  status: ProjectStatus;
  notes?: string | null;
  trackingNumber?: string | null;
  trackingCompany?: string | null;
  fulfillmentId?: string | null;
  canRegenerateThreeMf?: boolean;
  blocked?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<ProjectStatus>(
    MANUAL_PRODUCTION_STATUSES.includes(status) ? status : "READY_FOR_PRINT"
  );

  async function action(kind: "sync" | "retry" | "regenerate-3mf" | "reconcile-shopify") {
    const warning = kind === "reconcile-shopify"
      ? "Провери платената поръчка в Shopify и я свържи с проекта. При успешно потвърждение производството ще бъде поставено на опашка и може да използва Meshy кредити. Продължи?"
      : "Операцията може да стартира Meshy задача и да използва кредити. Продължи?";
    if (!confirm(warning)) return;
    setBusy(kind);
    setError("");
    try {
      await postJson(`/api/admin/projects/${projectId}/${kind}`, { confirmCredits: true });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await postJson(`/api/admin/projects/${projectId}/status`, {
        status: selectedStatus,
        productionNotes: String(form.get("productionNotes") || ""),
        trackingNumber: String(form.get("trackingNumber") || ""),
        trackingCompany: String(form.get("trackingCompany") || ""),
      });
      if (data?.fulfillment?.note) {
        if (data.fulfillment.created) setNotice(data.fulfillment.note);
        else setError(data.fulfillment.note);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="project-actions-stack">
      {blocked && <p role="alert" className="admin-error-box">Автоматизацията е спряна. Свери плащането или външната операция по процедурата за reconciliation, преди повторен опит.</p>}
      <fieldset disabled={blocked || Boolean(busy)} className="admin-action-fieldset">
      <div className="admin-action-row">
        {status === "CHECKOUT_CREATED" && (
          <button className="admin-button primary" onClick={() => action("reconcile-shopify")} disabled={Boolean(busy)}>
            {busy === "reconcile-shopify" ? "Проверявам Shopify…" : "Провери платена поръчка"}
          </button>
        )}
        <button className="admin-button secondary" onClick={() => action("sync")} disabled={Boolean(busy)}>
          {busy === "sync" ? "Checking…" : "Check Meshy status"}
        </button>
        {(status === "BUILD_FAILED" || status === "PRINT_FILE_FAILED") && (
          <button className="admin-button danger-outline" onClick={() => action("retry")} disabled={Boolean(busy)}>
            {busy === "retry" ? "Retrying…" : "Retry failed step"}
          </button>
        )}
        {canRegenerateThreeMf && (
          <button className="admin-button danger-outline" onClick={() => action("regenerate-3mf")} disabled={Boolean(busy)}>
            {busy === "regenerate-3mf" ? "Starting 3MF…" : "Regenerate expired 3MF"}
          </button>
        )}
      </div>

      {canRegenerateThreeMf && (
        <p className="file-note">Legacy 3MF линкът е изтекъл. Regenerate expired 3MF стартира нов Meshy multi-color print task и използва Meshy credits.</p>
      )}

      <form className="production-form" onSubmit={save}>
        <label>
          Production status
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as ProjectStatus)}>
            {(ALLOWED_TRANSITIONS[status] || []).map((item) => (
              <option value={item} key={item}>{STATUS_META[item].label}</option>
            ))}
          </select>
        </label>
        <label>
          Tracking number
          <input name="trackingNumber" defaultValue={trackingNumber || ""} placeholder="Задължителен при SHIPPED" />
        </label>
        <label>
          Куриер
          <input name="trackingCompany" defaultValue={trackingCompany || ""} placeholder="Econt / Speedy" />
        </label>
        <label className="full-span">
          Production notes
          <textarea name="productionNotes" defaultValue={notes || ""} rows={4} placeholder="Printer, color notes, defects, packing notes…" />
        </label>
        <button className="admin-button primary" disabled={Boolean(busy)}>
          {busy === "save" ? "Saving…" : "Save production update"}
        </button>
      </form>
      </fieldset>
      {fulfillmentId && <p className="file-note">Shopify fulfillment: {fulfillmentId}. Поискано е известяване; доставката на имейла не е потвърдена.</p>}
      {notice && <p className="file-note">{notice}</p>}
      {error && <div className="admin-error-box">{error}</div>}
      <EraseProject projectId={projectId} />
    </div>
  );
}

/** GDPR erasure. Irreversible, so the project id must be typed out. */
function EraseProject({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function erase() {
    setBusy(true);
    setError("");
    try {
      await postJson(`/api/admin/projects/${projectId}/erase`, { confirm });
      router.push("/admin/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erase failed");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="admin-danger-zone">
        <button className="admin-button danger-outline" onClick={() => setOpen(true)}>
          Изтрий проекта (GDPR)
        </button>
      </div>
    );
  }

  return (
    <div className="admin-danger-zone">
      <p className="file-note">
        Изтрива преглед, GLB и 3MF от Storage и премахва реда от базата. Действието е необратимо и се използва при
        заявка за изтриване на лични данни. Данните за поръчката в Shopify остават.
      </p>
      <label>
        Въведи ID на проекта за потвърждение
        <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={projectId} />
      </label>
      <div className="admin-action-row">
        <button className="admin-button danger-outline" onClick={erase} disabled={busy || confirm !== projectId}>
          {busy ? "Изтривам…" : "Потвърди изтриването"}
        </button>
        <button className="admin-button secondary" onClick={() => { setOpen(false); setConfirm(""); setError(""); }} disabled={busy}>
          Отказ
        </button>
      </div>
      {error && <div className="admin-error-box">{error}</div>}
    </div>
  );
}
