import type { ToyProject } from "@/lib/projects";
export function project(patch: Partial<ToyProject> = {}): ToyProject {
  return { id: "11111111-1111-4111-8111-111111111111", model_kind: "pop", prototype_task_id: "prototype-1234", preview_url: "https://asset.invalid/preview", size_cm: 10, price_eur: 49, status: "CHECKOUT_CREATED", ...patch };
}
