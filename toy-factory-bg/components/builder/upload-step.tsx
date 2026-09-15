"use client";
import type { Builder } from "./use-builder";
import { MODEL_OPTIONS } from "./image";
export function UploadStep(b: Builder) {
 const { modelKind, sourceImage, error, dragging, setDragging, inputRef, selectedModel, generatePreview, chooseModelKind, handleInput, handleDrop, catalog } = b;

  return (
    <section className="pmv2-builder">
      <div className="pmv2-builder-steps"><strong>1 СТИЛ</strong><span>—</span><strong>2 СНИМКА</strong><span>—</span><b>3 PREVIEW</b></div>
      <h1>Избери стил.<br /><span>Качи снимка.</span></h1>

      <div className="pmv2-builder-grid">
        <div className="pmv2-style-picker">
          <p className="pmv2-builder-kicker">СТЪПКА 1 · СТИЛ</p>
          <div className="pmv2-style-picker-rail">
            {MODEL_OPTIONS.map((option) => (
              <button key={option.value} type="button" className={`${option.value} ${modelKind === option.value ? "active" : ""}`} aria-pressed={modelKind === option.value} onClick={() => chooseModelKind(option.value)}>
                <div><img src={option.image} alt={`${option.name} стил`} /></div>
                <strong>{option.name}</strong>
                <span>{option.subtitle}</span>
              </button>
            ))}
          </div>
          <div className="pmv2-style-description">
            <p>ИЗБРАН СТИЛ</p>
            <strong>{selectedModel.name}</strong>
            <span>{selectedModel.copy}</span>
          </div>
        </div>

        <div className="pmv2-upload-panel">
          <p className="pmv2-builder-kicker">СТЪПКА 2 · СНИМКА</p>
          <div
            className={`pmv2-dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Качи снимка" onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); inputRef.current?.click(); } }}
          >
            <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleInput} />
            {sourceImage ? (
              <img src={sourceImage} alt="Качена снимка" />
            ) : (
              <div className="pmv2-dropzone-copy">
                <span>+</span>
                <strong>Качи снимка</strong>
                <small>JPG, PNG или WEBP · до 8 MB</small>
              </div>
            )}
          </div>
          <p className="pmv2-photo-tip">Най-добър резултат: цял ръст, добро осветление и видимо лице.</p>
          <p className="pmv2-photo-legal">
            С качването потвърждаваш, че имаш право да използваш снимката и приемаш{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">Политиката за поверителност</a> и{" "}
            <a href="/terms" target="_blank" rel="noreferrer">Общите условия</a>.
          </p>
          {error && <div className="pmv2-error" role="alert">{error}</div>}
        </div>
      </div>

      <div className="pmv2-generate-bar">
        <div><span>СТИЛ</span><strong>{modelKind.toUpperCase()}</strong><small> · цени от €{catalog[0].price}</small></div>
        <button type="button" disabled={!sourceImage} onClick={() => generatePreview(false)}>ГЕНЕРИРАЙ МОЯТА {modelKind.toUpperCase()} →</button>
      </div>
    </section>
  );

}
