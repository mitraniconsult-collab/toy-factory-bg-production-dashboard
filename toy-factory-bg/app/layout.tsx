import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site";
import { Manrope, Sofia_Sans_Extra_Condensed } from "next/font/google";
import "./globals.css";
import "./storefront.css";
import "./accessibility.css";

const displayFont = Sofia_Sans_Extra_Condensed({
  subsets: ["cyrillic", "latin"],
  variable: "--font-popme-display",
  display: "swap",
});

const bodyFont = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-popme-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl() || "http://localhost:3000"),
  alternates: { canonical: "/" },
  robots: { index: Boolean(siteUrl()), follow: Boolean(siteUrl()) },
  openGraph: { type: "website", locale: "bg_BG", siteName: "POPME", title: "POPME — Твоята фигурка", description: "Персонализирани POP, MINI и BRICK 3D фигурки по снимка.", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  title: "POPME — Made of you.",
  description: "Превърни снимката си в персонализирана POP, MINI или BRICK 3D колекционерска фигурка.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="bg" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body><a className="skip-link" href="#main-content">Към съдържанието</a><div id="main-content">{children}</div></body>
    </html>
  );
}
