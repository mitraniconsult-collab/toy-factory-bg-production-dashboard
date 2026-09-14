import ToyBuilder from "@/components/toy-builder";
import { getCatalog } from "@/lib/catalog";
export const metadata = { title: "Твоята визуализация | POPME", robots: { index: false, follow: false } };

export default function PreviewPage() {
  return (
    <main className="pmv2-create-page pmv2-preview-page">
      <div className="pmv2-create-announcement">ГОТОВО · ТОВА Е ТВОЯТА ФИГУРКА</div>
      <header className="pmv2-create-header">
        <a className="pmv2-logo" href="/" aria-label="POPME начало">popme<span>✦</span></a>
        <a href="/create" className="pmv2-create-back">← Нова снимка</a>
      </header>
      <ToyBuilder initialView="preview" catalog={getCatalog()} />
    </main>
  );
}
