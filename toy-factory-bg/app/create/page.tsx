import ToyBuilder from "@/components/toy-builder";
import { getCatalog } from "@/lib/catalog";
export const metadata = { title: "Създай фигурка | POPME", alternates: { canonical: "/create" } };

export default function CreatePage() {
  return (
    <main className="pmv2-create-page">
      <div className="pmv2-create-announcement">ПЛАЩАШ ЧАК СЛЕД КАТО ОДОБРИШ ВИЗУАЛИЗАЦИЯТА</div>
      <header className="pmv2-create-header">
        <a className="pmv2-logo" href="/" aria-label="POPME начало">popme<span>✦</span></a>
        <a href="/" className="pmv2-create-back">← Назад</a>
      </header>
      <ToyBuilder catalog={getCatalog()} />
    </main>
  );
}
