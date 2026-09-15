export type ModelKind = "pop" | "mini" | "brick";

export const MODEL_OPTIONS: Array<{
  value: ModelKind;
  name: string;
  subtitle: string;
  image: string;
  copy: string;
}> = [
  { value: "pop", name: "POP", subtitle: "Vinyl", image: "/marketing/pop-card.svg", copy: "Vinyl визия с по-голяма глава и опростени форми." },
  { value: "mini", name: "MINI", subtitle: "Chibi", image: "/marketing/mini.svg", copy: "Chibi визия с по-мек силует и повече характер." },
  { value: "brick", name: "BRICK", subtitle: "Brick", image: "/marketing/brick.svg", copy: "Геометрична brick-style версия, създадена по твоята снимка." },
];

export function isModelKind(value: string | null): value is ModelKind {
  return value === "pop" || value === "mini" || value === "brick";
}

export function prepareImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не успяхме да прочетем снимката."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Невалидна снимка."));
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Не успяхме да обработим снимката."));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
