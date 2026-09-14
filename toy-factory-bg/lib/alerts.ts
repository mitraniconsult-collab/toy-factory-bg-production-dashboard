/**
 * Operator alerts via Resend (https://resend.com). Best-effort: never throws,
 * so an email outage can never break production sync.
 *
 * Env:
 *   RESEND_API_KEY   - Resend API key
 *   ALERT_EMAIL_TO   - where alerts go (comma-separated allowed)
 *   ALERT_EMAIL_FROM - verified sender, e.g. "POPME Alerts <alerts@popme.bg>"
 *                      (defaults to Resend's test sender, which only delivers
 *                      to the Resend account owner's address)
 */

export type AlertInput = {
  subject: string;
  lines: string[];
  projectId?: string | null;
};
import { createHash } from "node:crypto";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function alertsConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);
}

export async function sendAlert(input: AlertInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.ALERT_EMAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!apiKey || !to.length) {
    console.warn("alert skipped (RESEND_API_KEY / ALERT_EMAIL_TO not set)", { subject: input.subject });
    return false;
  }

  const from = process.env.ALERT_EMAIL_FROM || "POPME Alerts <onboarding@resend.dev>";
  const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
  const adminLink = input.projectId && siteUrl ? `${siteUrl}/admin/projects/${input.projectId}` : null;

  const textLines = [...input.lines, adminLink ? `\nОтвори в dashboard: ${adminLink}` : ""].filter(Boolean);
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">
    ${input.lines.map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`).join("")}
    ${adminLink ? `<p style="margin:16px 0 0"><a href="${adminLink}">Отвори проекта в dashboard-а</a></p>` : ""}
  </div>`;

  try {
    const payload = JSON.stringify({ from, to, subject: `[POPME] ${input.subject}`, text: textLines.join("\n"), html });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `popme-alert-${createHash("sha256").update(payload).digest("hex")}` },
      signal: AbortSignal.timeout(10_000),
      body: payload,
    });
    if (!response.ok) {
      console.error("alert send failed", { status: response.status, body: await response.text().catch(() => "") });
      return false;
    }
    return true;
  } catch (error) {
    console.error("alert send error", error);
    return false;
  }
}
