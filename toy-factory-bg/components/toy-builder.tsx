"use client";
import { useEffect, useRef } from "react";
import type { CatalogItem } from "@/lib/catalog";
import { useBuilder } from "./builder/use-builder";
import { UploadStep } from "./builder/upload-step";
import { PreviewStep } from "./builder/preview-step";
import { GenerationProgress } from "./builder/progress";

export default function ToyBuilder({ catalog, initialView = "upload" }: { catalog: CatalogItem[]; initialView?: "upload" | "preview" }) {
  const b = useBuilder(catalog, initialView);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => { if (b.hydrated && ["preview", "generating", "timeout", "error"].includes(b.step)) region.current?.focus(); }, [b.step, b.hydrated]);
  if (!b.hydrated) return <section className="pmv2-builder-loading" role="status">Зареждаме твоя POPME…</section>;
  return <div ref={region} tabIndex={-1} aria-label="Създаване на фигурка">
    {b.notice && <p className="builder-notice" role="status">{b.notice}</p>}
    {b.step === "generating" ? <GenerationProgress {...b} /> : <>
      {(b.step === "timeout" || b.step === "error") && b.draft && <div className="builder-notice"><p role="alert">{b.error}</p><button className="pmv2-primary" onClick={() => b.resume()}>Провери същата визуализация</button><button className="pmv2-reset-link" onClick={b.reset}>Започни отначало</button></div>}
      {b.previewImage ? <PreviewStep {...b} /> : <UploadStep {...b} />}
    </>}
  </div>;
}
