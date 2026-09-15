import { ImageResponse } from "next/og";
export const alt = "POPME — персонализирани 3D фигурки";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#fff6e9", color: "#272323" }}><div style={{ fontSize: 140, fontWeight: 800 }}>popme</div><div style={{ fontSize: 60 }}>Made of you.</div><div style={{ fontSize: 34, marginTop: 40, color: "#a33728" }}>POP · MINI · BRICK / 10 · 15 · 20 cm</div></div>, size);
}
