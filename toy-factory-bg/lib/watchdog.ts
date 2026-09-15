import { sendAlert } from "@/lib/alerts";
import { listProjectsNeedingAlert, ProjectStatus, ToyProject, updateProject } from "@/lib/projects";
import { STATUS_META } from "@/lib/status";
import { retryDelay } from "@/lib/jobs";

/** Automated stages where a project should not sit for long. */
export const STALE_STATUSES: ProjectStatus[] = [
  "PAID_BUILD_STARTING",
  "BUILD_SUBMITTING",
  "3D_GENERATING",
  "MODEL_RESIZE_SUBMITTING",
  "MODEL_RESIZING",
  "PRINT_FILE_SUBMITTING",
  "PRINT_FILE_GENERATING",
];

export const STALE_AFTER_MINUTES = Number(process.env.WATCHDOG_STALE_MINUTES || 120);

function describe(project: ToyProject) {
  const meta = STATUS_META[project.status];
  return [
    `Поръчка: ${project.shopify_order_name || "(без Shopify номер)"}`,
    `Проект: ${project.id}`,
    `Клиент: ${project.customer_name || "—"} <${project.customer_email || "—"}>`,
    `Стил/размер: ${(project.model_kind || "pop").toUpperCase()} · ${project.size_cm} cm`,
    `Статус: ${meta?.label || project.status}`,
    `Последна промяна на статус: ${project.status_changed_at || project.updated_at || "—"}`,
  ];
}

/**
 * Sends one alert per problem, then stamps `alert_sent_at` so the same
 * problem is not re-sent every cron run. `alert_sent_at` is cleared whenever
 * `last_error` is cleared (see updateProject), so a new failure alerts again.
 */
export async function runWatchdog() {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();
  const projects = await listProjectsNeedingAlert({ staleStatuses: STALE_STATUSES, staleBefore });
  const results: Array<{ id: string; kind: "error" | "stale"; sent: boolean }> = [];

  for (const project of projects) {
    const isStale = !project.last_error && STALE_STATUSES.includes(project.status);
    const kind = isStale ? "stale" : "error";

    const subject = isStale
      ? `Проект виси в "${STATUS_META[project.status]?.label || project.status}" над ${STALE_AFTER_MINUTES} мин`
      : `${STATUS_META[project.status]?.label || project.status} — ${project.shopify_order_name || project.id}`;

    const lines = isStale
      ? [`Проектът не е сменял статус от ${STALE_AFTER_MINUTES}+ минути. Провери Meshy задачата или натисни "Check Meshy status".`, "", ...describe(project)]
      : [`Грешка: ${project.last_error}`, "", ...describe(project)];

    const sent = await sendAlert({ subject, lines, projectId: project.id });
    await updateProject(project.id, sent
      ? { alert_sent_at: new Date().toISOString(), alert_attempts: 0 }
      : { alert_attempts: (project.alert_attempts || 0) + 1, alert_next_retry_at: new Date(Date.now() + retryDelay((project.alert_attempts || 0) + 1) * 1000).toISOString() }
    ).catch(() => null);
    results.push({ id: project.id, kind, sent });
  }

  return results;
}
