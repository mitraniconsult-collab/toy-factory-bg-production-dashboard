import type { ProjectStatus } from "@/lib/projects";
export const QUEUES: Record<string, { label: string; statuses?: ProjectStatus[] }> = {
  attention: { label: "Needs attention" },
  ai: { label: "AI processing", statuses: ["PAID_BUILD_STARTING", "BUILD_SUBMITTING", "3D_GENERATING", "MODEL_RESIZE_SUBMITTING", "MODEL_RESIZING", "PRINT_FILE_SUBMITTING", "PRINT_FILE_GENERATING"] },
  ready: { label: "Ready to print", statuses: ["READY_FOR_PRINT"] },
  printing: { label: "Printing", statuses: ["PRINTING"] },
  packing: { label: "Packing", statuses: ["PRINTED"] },
  shipping: { label: "Shipping", statuses: ["PACKED", "SHIPPED"] },
};
export const ALLOWED_TRANSITIONS: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
  READY_FOR_PRINT: ["READY_FOR_PRINT", "PRINTING", "CANCELLED"], PRINTING: ["PRINTING", "PRINTED", "CANCELLED"],
  PRINTED: ["PRINTED", "PACKED", "CANCELLED"], PACKED: ["PACKED", "SHIPPED", "CANCELLED"], SHIPPED: ["SHIPPED"], CANCELLED: ["CANCELLED"],
};
