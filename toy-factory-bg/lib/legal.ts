/**
 * Single source of truth for merchant details shown on /terms, /privacy and
 * the footer. Every value in double square brackets is a placeholder that
 * MUST be replaced before launch — grep for "[[" to find them all.
 */
export const MERCHANT = {
  brand: "POPME",
  legalName: "ХОУМСЕКТОР ЕООД",
  eik: "207265373",
  vatNumber: "[[ДДС номер, напр. BG207265373 — или премахни реда, ако няма регистрация по ДДС]]",
  address: "[[Адрес на управление по Търговския регистър]]",
  email: "[[email за клиенти, напр. hello@popme.bg]]",
  phone: "[[телефон за контакт]]",
  siteUrl: "[[https://popme.bg]]",
  productionDays: "[[5–10]]",
  deliveryDays: "[[1–3]]",
  courier: "[[Еконт / Спиди]]",
  retentionPaidDays: 90,
  retentionUnpaidDays: 7,
  updatedAt: "[[дата на последна промяна, напр. 1 октомври 2026]]",
} as const;

export const LEGAL_LINKS = [
  { href: "/terms", label: "Общи условия" },
  { href: "/privacy", label: "Поверителност" },
] as const;

export const LAUNCH_BLOCKERS = Object.entries(MERCHANT).filter(([, value]) => String(value).includes("[[")).map(([key]) => key);

/** Third parties that process customer data for the service. */
export const PROCESSORS = [
  { name: "Meshy (Meshy AI)", role: "генерира 3D визуализацията и модела от снимката", location: "САЩ" },
  { name: "Shopify", role: "плащане, поръчки и изпращане на потвърждения по имейл", location: "Канада / ЕС" },
  { name: "Supabase", role: "база данни и съхранение на визуализацията и файловете за печат", location: "[[регион на проекта, напр. ЕС (Франкфурт)]]" },
  { name: "Vercel", role: "хостинг на сайта", location: "САЩ / ЕС" },
  { name: "[[Куриер]]", role: "доставка на фигурката", location: "България" },
] as const;
