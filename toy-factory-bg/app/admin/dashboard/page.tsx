import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/admin/logout-button";
import { SyncAllButton } from "@/components/admin/admin-actions";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getIntegrationChecks } from "@/lib/integrations";
import { listProjects, PROJECT_STATUSES, ProjectStatus } from "@/lib/projects";
import { QUEUES } from "@/lib/operations";
import { BulkActions } from "@/components/admin/bulk-actions";
import { STATUS_META } from "@/lib/status";

export const dynamic = "force-dynamic";

function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }
function date(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("bg-BG", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Sofia" }).format(new Date(value));
}
function modelLabel(value?: string | null) { return (value || "pop").toUpperCase(); }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const params = await searchParams;
  const rawStatus = typeof params.status === "string" ? params.status : "";
  const status = PROJECT_STATUSES.includes(rawStatus as ProjectStatus) ? (rawStatus as ProjectStatus) : undefined;
  const q = typeof params.q === "string" ? params.q : "";
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const queue = QUEUES[value("queue")] ? value("queue") : "";
  const page = Math.max(1, Math.min(100000, Number.parseInt(value("page"), 10) || 1));
  const issue = queue === "attention" ? "any" : value("issue");
  const found = await listProjects({ status, q, page, statuses: QUEUES[queue]?.statuses, style: value("style"), size: value("size"), from: value("from"), to: value("to"), issue });
  const projects = found.slice(0, 25);
  const checks = getIntegrationChecks();
  const pageHref = (next: number) => {
    const search = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    search.set("page", String(next)); return `/admin/dashboard?${search}`;
  };

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div><Link href="/admin/dashboard" className="admin-brand">POPME / OPS</Link><span>Production</span></div>
        <div className="admin-topbar-actions"><SyncAllButton /><LogoutButton /></div>
      </header>

      <section className="admin-page-heading">
        <div><p className="admin-kicker">OPERATIONS</p><h1>Поръчки и производство</h1><p>Shopify плащане → Meshy 3D → exact size → 3MF → печат → изпращане.</p></div>
        <div className="integration-strip">
          {checks.map((item) => <div className={`integration-pill ${item.ok ? "ok" : "missing"}`} key={item.name}><span></span><strong>{item.name}</strong><small>{item.ok ? "configured" : "missing"}</small></div>)}
        </div>
      </section>

      <nav className="admin-queues" aria-label="Работни опашки">
        <Link href="/admin/dashboard" aria-current={!queue ? "page" : undefined}>Всички</Link>
        {Object.entries(QUEUES).map(([key, item]) => <Link key={key} href={`/admin/dashboard?queue=${key}`} aria-current={queue === key ? "page" : undefined}>{item.label}</Link>)}
      </nav>

      <section className="admin-table-card">
        <form className="admin-filters">
          <input name="q" defaultValue={q} aria-label="Търсене по поръчка, клиент или ID" placeholder="Order, client, email or Project ID" />
          <input type="hidden" name="queue" value={queue} /><select aria-label="Статус" name="status" defaultValue={status || ""}>
            <option value="">Всички статуси</option>
            {PROJECT_STATUSES.map((item) => <option key={item} value={item}>{STATUS_META[item].label}</option>)}
          </select>
          <label>Стил<select name="style" defaultValue={value("style")}><option value="">Всички</option>{["pop", "mini", "brick"].map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select></label>
          <label>Размер<select name="size" defaultValue={value("size")}><option value="">Всички</option>{["10", "15", "20"].map((s) => <option key={s} value={s}>{s} cm</option>)}</select></label>
          <label>От (UTC)<input type="date" name="from" defaultValue={value("from")} /></label>
          <label>До (UTC)<input type="date" name="to" defaultValue={value("to")} /></label>
          <label>Проблем<select name="issue" defaultValue={issue}><option value="">Всички</option><option value="any">Needs attention</option><option value="held">Спряна автоматизация</option><option value="retry">С повторни опити</option></select></label>
          <button className="admin-button secondary">Филтрирай</button>
          {(q || status) && <Link className="admin-clear-link" href="/admin/dashboard">Clear</Link>}
        </form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Project</th><th>Shopify</th><th>Client</th><th>Model</th><th>Size</th><th>Status</th><th>Job / опити</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><strong>TF-{shortId(project.id)}</strong><small>{project.id}</small></td>
                  <td><strong>{project.shopify_order_name || "Not paid"}</strong><small>{project.paid_at ? `Paid ${date(project.paid_at)}` : "Awaiting checkout/payment"}</small></td>
                  <td><strong>{project.customer_name || "—"}</strong><small>{project.customer_email || project.shipping_city || "—"}</small></td>
                  <td><span className={`model-chip ${project.model_kind || "pop"}`}>{modelLabel(project.model_kind)}</span></td>
                  <td><strong>{project.size_cm} cm</strong><small>€{Number(project.price_eur).toFixed(2)}</small></td>
                  <td><span className={`status-chip ${STATUS_META[project.status].tone}`}>{STATUS_META[project.status].label}</span>{project.last_error && <small className="table-error">Needs attention</small>}</td>
                  <td><strong>Retry {project.retry_count || 0}</strong><small>{project.last_operation || "—"}</small>{project.automation_blocked && <small className="table-error">Спряна автоматизация</small>}</td>
                  <td>{date(project.created_at)}</td>
                  <td><Link className="admin-open-link" href={`/admin/projects/${project.id}`}>Open →</Link></td>
                </tr>
              ))}
              {!projects.length && <tr><td colSpan={9} className="admin-empty">Няма проекти по този филтър.</td></tr>}
            </tbody>
          </table>
        </div>
        <nav className="admin-pagination" aria-label="Страници">{page > 1 && <Link href={pageHref(page-1)}>← Предишна</Link>}<span>Страница {page} · {projects.length} проекта</span>{found.length > 25 && <Link href={pageHref(page+1)}>Следваща →</Link>}</nav>
        <BulkActions projects={projects.filter((p) => !p.automation_blocked && !p.assets_purged_at && ["PRINTING", "PRINTED"].includes(p.status)).map((p) => ({ id: p.id, status: p.status, label: p.shopify_order_name || p.id.slice(0, 8) }))} />
      </section>
    </main>
  );
}
