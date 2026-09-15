"use client";
import type { Builder } from "./use-builder";
import { MODEL_OPTIONS } from "./image";
export function GenerationProgress(b: Builder) {
 const { modelKind, progress, error, selectedModel } = b;
    return (
      <section className="pmv2-builder pmv2-generating">
        <div className="pmv2-progress-copy">
          <div className="pmv2-steps-mini"><b>1 СТИЛ</b><span>—</span><b>2 СНИМКА</b><span>—</span><strong>3 PREVIEW</strong></div>
          <p>СЪЗДАВАМЕ ТВОЯ {modelKind.toUpperCase()}</p>
          <h1>Малко магия.<br /><span>После си ти.</span></h1>
          <div className="pmv2-progress-track" role="progressbar" aria-label="Генериране на визуализация" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }} /></div>
          <div className="pmv2-progress-meta" aria-live="polite"><span>Генериране</span><strong>{Math.round(progress)}%</strong></div>
          <p className="pmv2-progress-note">Изчакваме твоята визуализация. При refresh ще проверим същата задача.</p>
          {error && <div className="pmv2-error" role="alert">{error}</div>}
        </div>
        <div className={`pmv2-generating-figure ${modelKind}`}>
          <img src={selectedModel.image} alt={`${selectedModel.name} стил`} />
          <span>{selectedModel.name}</span>
        </div>
      </section>
    );

}
