"use client";
import { useEffect, useReducer, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { CatalogItem } from "@/lib/catalog";
import { builderReducer, initialState } from "./machine";
import { isModelKind, MODEL_OPTIONS, prepareImage, type ModelKind } from "./image";
import { photoStore, readDraft, writeDraft, submissionId, type Draft } from "./session";

export function useBuilder(catalog: CatalogItem[], initialView: "upload" | "preview") {
  const [state, dispatch] = useReducer(builderReducer, initialState);
  const [modelKind, setModelKind] = useState<ModelKind>("pop");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState("15");
  const [regenerations, setRegenerations] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const requestId = useRef<string | null>(null);
  const fail = (error: unknown) => dispatch({ type: "ERROR", message: error instanceof Error ? error.message : "Временна грешка. Опитай пак." });
  const selectedModel = MODEL_OPTIONS.find((m) => m.value === modelKind)!;
  const price = catalog.find((c) => c.size === size)!.price;

  async function poll(saved: Draft, signal: AbortSignal) {
    dispatch({ type: "START" });
    const started = Date.now();
    while (!signal.aborted && Date.now() - started < 180000) {
      const response = await fetch(`/api/meshy/task/prototype/${saved.taskId}?modelKind=${saved.modelKind}`, { cache: "no-store", headers: { "x-preview-token": saved.accessToken }, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
      const task = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 410) { writeDraft(null); setDraft(null); setPreviewImage(null); }
        throw new Error(task.error || "Не успяхме да проверим визуализацията.");
      }
      dispatch({ type: "PROGRESS", value: task.progress || 0 });
      if (task.status === "SUCCEEDED") {
        const image = task.image_urls?.[0];
        if (!image) throw new Error("Визуализацията не е налична. Опитай повторна проверка.");
        setPreviewImage(image); dispatch({ type: "READY" });
        window.history.replaceState({}, "", "/create/preview"); return;
      }
      if (["FAILED", "EXPIRED", "CANCELED"].includes(task.status)) { setDraft(null); writeDraft(null); throw new Error("Визуализацията не завърши. Можеш да опиташ с друга снимка."); }
      await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 2000); signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true }); });
    }
    if (!signal.aborted) dispatch({ type: "TIMEOUT", message: "Все още чакаме резултат. Провери същата визуализация отново." });
  }

  async function resume(saved = draft) {
    if (!saved || running.current) return;
    running.current = true;
    controller.current = new AbortController();
    try { await poll(saved, controller.current.signal); }
    catch (e) { if (!controller.current.signal.aborted) fail(e); }
    finally { running.current = false; }
  }

  useEffect(() => {
    mounted.current = true;
    const saved = readDraft();
    const selected = new URLSearchParams(window.location.search).get("style");
    if (saved && (!selected || selected === saved.modelKind)) {
      setDraft(saved); setModelKind(saved.modelKind); setRegenerations(saved.regenerations); setConsent(true);
      void resume(saved);
    } else {
      if (isModelKind(selected)) setModelKind(selected);
      if (initialView === "preview") setNotice("Няма активна визуализация или тя е изтекла. Качи снимка, за да започнеш.");
    }
    void photoStore().then((photo) => { if (mounted.current) setSourceImage(photo); });
    setHydrated(true);
    return () => { mounted.current = false; controller.current?.abort(); running.current = false; };
    // Mount restores compact server task metadata, never starts a new AI task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptFile(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) return fail(new Error("Качи JPG, PNG или WEBP до 8 MB."));
    try {
      const photo = await prepareImage(file);
      requestId.current = submissionId(true);
      setSourceImage(photo); setPreviewImage(null); setDraft(null); setRegenerations(0); writeDraft(null); dispatch({ type: "RESET" });
      if (!(await photoStore(photo))) setNotice("Снимката е заредена. Браузърът не позволява запазване след refresh.");
    } catch (e) { fail(e); }
  }
  async function generatePreview(isRegeneration = false) {
    if (running.current) return;
    if (!sourceImage || !consent) return fail(new Error("Качи снимка и потвърди правото си да я използваш."));
    if (isRegeneration && regenerations >= 2) return fail(new Error("Използва двата допълнителни опита."));
    running.current = true; controller.current = new AbortController(); dispatch({ type: "START" }); setPreviewImage(null);
    requestId.current = isRegeneration ? submissionId(true) : requestId.current || submissionId();
    try {
      const response = await fetch("/api/meshy/prototype", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: sourceImage, modelKind, requestId: requestId.current }), signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(30000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не успяхме да стартираме визуализацията.");
      const next: Draft = { taskId: data.taskId, accessToken: data.accessToken, modelKind, regenerations: regenerations + (isRegeneration ? 1 : 0), expiresAt: Date.now() + 3500000 };
      setDraft(next); setRegenerations(next.regenerations);
      if (!writeDraft(next)) setNotice("Не затваряй страницата: браузърът блокира запазването на визуализацията.");
      await poll(next, controller.current.signal);
    } catch (e) { if (!controller.current.signal.aborted) fail(e); }
    finally { running.current = false; }
  }
  async function goToCheckout() {
    if (!draft || running.current) return;
    running.current = true; dispatch({ type: "READY" }); dispatch({ type: "CHECKOUT" });
    try {
      const response = await fetch("/api/shopify/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(90000), body: JSON.stringify({ prototypeTaskId: draft.taskId, accessToken: draft.accessToken, modelKind, size, expectedPrice: price }) });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error || "Временна грешка при поръчката. Опитай пак.");
      const url = new URL(data.checkoutUrl); if (url.protocol !== "https:") throw new Error("Невалидна връзка за плащане.");
      window.location.assign(url.href);
    } catch (e) { fail(e); }
    finally { running.current = false; }
  }
  function reset() { controller.current?.abort(); running.current = false; writeDraft(null); void photoStore(null); setSourceImage(null); setPreviewImage(null); setDraft(null); setRegenerations(0); setConsent(false); setNotice(""); dispatch({ type: "RESET" }); window.history.replaceState({}, "", `/create?style=${modelKind}`); }
  function chooseModelKind(value: ModelKind) { requestId.current = submissionId(true); setModelKind(value); setPreviewImage(null); setDraft(null); writeDraft(null); setRegenerations(0); dispatch({ type: "RESET" }); }
  return { catalog, step: state.phase, progress: state.progress, error: state.error, notice, modelKind, sourceImage, previewImage, consent, setConsent, dragging, setDragging, size, setSize, hydrated, inputRef, selectedModel, price, attemptsLeft: Math.max(0, 2-regenerations), checkoutLoading: state.phase === "checkout", draft, resume, generatePreview, goToCheckout, reset, chooseModelKind,
    previewError: () => { setPreviewImage(null); fail(new Error("Изображението е изтекло. Провери визуализацията отново.")); },
    handleInput: (e: ChangeEvent<HTMLInputElement>) => acceptFile(e.target.files?.[0]), handleDrop: (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); void acceptFile(e.dataTransfer.files?.[0]); } };
}
export type Builder = ReturnType<typeof useBuilder>;
