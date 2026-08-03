/**
 * Paletas de color de la organización.
 * Cada paleta define las CSS variables usadas en globals.css.
 */

import type { CSSProperties } from "react";

export type ThemeVars = {
  background: string;
  foreground: string;
  surface: string;
  surfaceElevated: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarHover: string;
  sidebarActive: string;
  muted: string;
  mutedForeground: string;
  border: string;
  accent: string;
  accentForeground: string;
  success: string;
  warning: string;
  danger: string;
};

export type ColorPalette = {
  id: string;
  name: string;
  description: string;
  /** Tres swatches para preview: fondo, acento, sidebar */
  swatches: [string, string, string];
  vars: ThemeVars;
};

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "simpleinmo",
    name: "SimpleInmo",
    description: "Turquesa inmobiliario, fondo cálido claro.",
    swatches: ["#f3f1ec", "#1f4e5f", "#102833"],
    vars: {
      background: "#f3f1ec",
      foreground: "#1c2430",
      surface: "#faf9f6",
      surfaceElevated: "#ffffff",
      sidebar: "#102833",
      sidebarForeground: "#e8eef1",
      sidebarHover: "#1a3d4c",
      sidebarActive: "#1a3d4c",
      muted: "#ebe6de",
      mutedForeground: "#5b6573",
      border: "#d7d0c5",
      accent: "#1f4e5f",
      accentForeground: "#f7fafb",
      success: "#047857",
      warning: "#b45309",
      danger: "#b42318",
    },
  },
  {
    id: "obra",
    name: "Obra ámbar",
    description: "Hormigón claro con acento de seguridad industrial.",
    swatches: ["#f3f1ec", "#b45309", "#1c1917"],
    vars: {
      background: "#f3f1ec",
      foreground: "#1c1917",
      surface: "#faf9f6",
      surfaceElevated: "#ffffff",
      sidebar: "#1c1917",
      sidebarForeground: "#e7e5e4",
      sidebarHover: "#292524",
      sidebarActive: "#44403c",
      muted: "#e7e5e4",
      mutedForeground: "#78716c",
      border: "#d6d3d1",
      accent: "#b45309",
      accentForeground: "#fffbeb",
      success: "#047857",
      warning: "#b45309",
      danger: "#b91c1c",
    },
  },
  {
    id: "acero",
    name: "Acero",
    description: "Grises fríos y azul estructural.",
    swatches: ["#eef1f4", "#2563eb", "#0f172a"],
    vars: {
      background: "#eef1f4",
      foreground: "#0f172a",
      surface: "#f8fafc",
      surfaceElevated: "#ffffff",
      sidebar: "#0f172a",
      sidebarForeground: "#e2e8f0",
      sidebarHover: "#1e293b",
      sidebarActive: "#334155",
      muted: "#e2e8f0",
      mutedForeground: "#64748b",
      border: "#cbd5e1",
      accent: "#2563eb",
      accentForeground: "#eff6ff",
      success: "#0f766e",
      warning: "#b45309",
      danger: "#b91c1c",
    },
  },
  {
    id: "bosque",
    name: "Bosque",
    description: "Verdes naturales sobre crema.",
    swatches: ["#f4f1ea", "#166534", "#14532d"],
    vars: {
      background: "#f4f1ea",
      foreground: "#14532d",
      surface: "#faf8f4",
      surfaceElevated: "#ffffff",
      sidebar: "#14532d",
      sidebarForeground: "#dcfce7",
      sidebarHover: "#166534",
      sidebarActive: "#15803d",
      muted: "#e7e0d4",
      mutedForeground: "#6b7280",
      border: "#d6d0c4",
      accent: "#166534",
      accentForeground: "#f0fdf4",
      success: "#15803d",
      warning: "#b45309",
      danger: "#b91c1c",
    },
  },
  {
    id: "grafito",
    name: "Grafito",
    description: "Oscuro profesional con acento violeta.",
    swatches: ["#18181b", "#a78bfa", "#09090b"],
    vars: {
      background: "#18181b",
      foreground: "#fafafa",
      surface: "#27272a",
      surfaceElevated: "#3f3f46",
      sidebar: "#09090b",
      sidebarForeground: "#e4e4e7",
      sidebarHover: "#27272a",
      sidebarActive: "#3f3f46",
      muted: "#3f3f46",
      mutedForeground: "#a1a1aa",
      border: "#52525b",
      accent: "#a78bfa",
      accentForeground: "#1e1b4b",
      success: "#4ade80",
      warning: "#fbbf24",
      danger: "#f87171",
    },
  },
  {
    id: "mar",
    name: "Mar",
    description: "Turquesa de costa y arena fría.",
    swatches: ["#ecf3f4", "#0f766e", "#134e4a"],
    vars: {
      background: "#ecf3f4",
      foreground: "#134e4a",
      surface: "#f5fafb",
      surfaceElevated: "#ffffff",
      sidebar: "#134e4a",
      sidebarForeground: "#ccfbf1",
      sidebarHover: "#115e59",
      sidebarActive: "#0f766e",
      muted: "#d8e8ea",
      mutedForeground: "#5b7a7c",
      border: "#b8d0d3",
      accent: "#0f766e",
      accentForeground: "#f0fdfa",
      success: "#047857",
      warning: "#b45309",
      danger: "#be123c",
    },
  },
];

export const DEFAULT_THEME_ID = "simpleinmo";

/** Acento legible sobre fondos oscuros del turnero (sidebar / kiosk). */
function turneroAccentFrom(accent: string, sidebar: string): {
  accent: string;
  foreground: string;
} {
  // Paletas conocidas: tono más claro para contraste en UI oscura
  const presets: Record<string, string> = {
    "#1f4e5f": "#5eb3c9",
    "#b45309": "#f59e0b",
    "#0369a1": "#38bdf8",
    "#047857": "#34d399",
    "#4f46e5": "#a5b4fc",
    "#0f766e": "#2dd4bf",
  };
  const key = accent.toLowerCase();
  const light = presets[key] ?? lightenHex(accent, 0.45);
  return { accent: light, foreground: sidebar };
}

function lightenHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const n = Number.parseInt(raw, 16);
  const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amount));
  const g = Math.min(255, ((n >> 8) & 255) + Math.round(255 * amount));
  const b = Math.min(255, (n & 255) + Math.round(255 * amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function getColorPalette(
  themeId: string | null | undefined,
): ColorPalette {
  return (
    COLOR_PALETTES.find((p) => p.id === themeId) ??
    COLOR_PALETTES.find((p) => p.id === DEFAULT_THEME_ID)!
  );
}

/** Mapea paleta → variables CSS del ERP (SimpleInmo). */
export function themeToInlineStyle(
  themeId: string | null | undefined,
): CSSProperties {
  const { vars } = getColorPalette(themeId);
  const turnero = turneroAccentFrom(vars.accent, vars.sidebar);
  return {
    ["--background" as string]: vars.background,
    ["--foreground" as string]: vars.foreground,
    ["--card" as string]: vars.surfaceElevated,
    ["--card-foreground" as string]: vars.foreground,
    ["--primary" as string]: vars.accent,
    ["--primary-foreground" as string]: vars.accentForeground,
    ["--secondary" as string]: vars.muted,
    ["--secondary-foreground" as string]: vars.foreground,
    ["--muted" as string]: vars.muted,
    ["--muted-foreground" as string]: vars.mutedForeground,
    ["--destructive" as string]: vars.danger,
    ["--border" as string]: vars.border,
    ["--ring" as string]: vars.accent,
    ["--sidebar" as string]: vars.sidebar,
    ["--sidebar-foreground" as string]: vars.sidebarForeground,
    ["--sidebar-active" as string]: vars.sidebarActive,
    ["--surface" as string]: vars.surface,
    ["--accent" as string]: vars.accent,
    ["--accent-foreground" as string]: vars.accentForeground,
    ["--turnero-bg" as string]: vars.sidebar,
    ["--turnero-surface" as string]: vars.sidebarActive,
    ["--turnero-elevated" as string]: vars.sidebarHover,
    ["--turnero-border" as string]: "rgba(255,255,255,0.12)",
    ["--turnero-accent" as string]: turnero.accent,
    ["--turnero-accent-foreground" as string]: turnero.foreground,
    ["--turnero-muted" as string]: "rgba(232,238,241,0.55)",
  };
}

export function themeToCssText(themeId: string | null | undefined): string {
  const style = themeToInlineStyle(themeId);
  return Object.entries(style)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

export function applyThemeToDocument(themeId: string | null | undefined) {
  if (typeof document === "undefined") return;
  const style = themeToInlineStyle(themeId);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === "string") {
      root.style.setProperty(key, value);
    }
  }
}
