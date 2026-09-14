"use client";
import type { Builder } from "./use-builder";
import { MODEL_OPTIONS } from "./image";
export function PreviewStep(b: Builder) {
 const { modelKind, sourceImage, previewImage, progress, error, consent, setConsent, dragging, setDragging, size, setSize, checkoutLoading, inputRef, selectedModel, price, attemptsLeft, generatePreview, goToCheckout, reset, chooseModelKind, handleInput, handleDrop, catalog } = b;
    return (
      <section className="pmv2-preview-builder">
        <div className="pmv2-preview-visual-wrap">
          <div className="pmv2-preview-visual">
            <span className="pmv2-preview-style">{modelKind.toUpperCase()}</span>
            <img onError={b.previewError} src={previewImage || undefined} alt={`Твоята ${modelKind.toUpperCase()} POPME визуализация`} />
          </div>
          <div className="pmv2-preview-source-row">
            {sourceImage && <img src={sourceImage} alt="Оригиналната качена снимка" />}
            <p>Фонът е илюстративен и не е част от крайния 3D продукт.</p>
          </div>
        </div>

        <div className="pmv2-preview-controls">
          <p className="pmv2-builder-kicker">ТВОЯТ РЕЗУЛТАТ</p>
          <h1>Това е<br /><span>твоят POPME.</span></h1>
          <div className="pmv2-selected-style-line"><span>Стил</span><strong>{modelKind.toUpperCase()}</strong></div>

          <div className="pmv2-size-selector">
            <p>ИЗБЕРИ РАЗМЕР</p>
            <div>
              {catalog.map((c) => ({ value: c.size, price: c.price })).map((option) => (
                <button key={option.value} type="button" className={size === option.value ? "active" : ""} aria-pressed={size === option.value} onClick={() => setSize(option.value)}>
                  <strong>{option.value} cm</strong><span>€{option.price}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="pmv2-preview-benefits">
            <li><span>✓</span>3D производството стартира след плащане</li>
            <li><span>✓</span>Сигурно плащане през Shopify</li>
          </ul>

          {error && <div className="pmv2-error" role="alert">{error}</div>}
          <button type="button" className="pmv2-regenerate" onClick={() => generatePreview(true)} disabled={attemptsLeft <= 0 || !sourceImage || checkoutLoading}>
            {attemptsLeft > 0 ? `Генерирай отново (${attemptsLeft} останали)` : "Няма останали нови опити"}
          </button>
          <button type="button" className="pmv2-reset-link" onClick={reset}>Качи друга снимка</button>
        </div>

        <div className="pmv2-preview-checkout-bar">
          <div><span>{modelKind.toUpperCase()} · {size} CM</span><strong>€{price}</strong></div>
          <button type="button" onClick={goToCheckout} disabled={checkoutLoading || !b.draft}>
            {checkoutLoading ? "ОТВАРЯМЕ CHECKOUT…" : "ПОРЪЧАЙ МОЯТА ФИГУРКА →"}
          </button>
        </div>
      </section>
    );

}
