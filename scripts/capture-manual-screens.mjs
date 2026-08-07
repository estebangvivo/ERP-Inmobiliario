/**
 * Captura pantallas del ERP para el manual de usuario.
 * Uso: node scripts/capture-manual-screens.mjs
 * Requiere: servidor en http://localhost:3001 y playwright instalado.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DOCS = path.join(ROOT, "docs", "manual", "images");
const OUT_PUBLIC = path.join(ROOT, "public", "manual", "images");
const BASE = process.env.MANUAL_BASE_URL || "http://localhost:3001";
const EMAIL = process.env.MANUAL_EMAIL || "admin@erp.local";
const PASSWORD = process.env.MANUAL_PASSWORD || "demo1234";

const screens = [
  { id: "01-login", path: "/login", beforeLogin: true, title: "Ingreso" },
  { id: "02-dashboard", path: "/dashboard", title: "Dashboard" },
  { id: "03-propiedades", path: "/gestion/propiedades", title: "Propiedades" },
  {
    id: "04-propiedad-nueva",
    path: "/gestion/propiedades/nueva",
    title: "Nueva propiedad",
  },
  { id: "05-complejos", path: "/complejos", title: "Complejos" },
  { id: "06-contratos", path: "/contratos", title: "Contratos" },
  { id: "07-contrato-nuevo", path: "/contratos/nuevo", title: "Nuevo contrato" },
  { id: "08-cobros", path: "/cobros", title: "Cobros" },
  { id: "09-expensas", path: "/expensas", title: "Expensas" },
  { id: "10-mantenimiento", path: "/mantenimiento", title: "Mantenimiento" },
  { id: "11-rendiciones", path: "/rendiciones", title: "Rendiciones" },
  { id: "12-consultas", path: "/leads", title: "Consultas" },
  { id: "13-visitas", path: "/visitas", title: "Visitas" },
  { id: "14-turnero", path: "/turnero", title: "Turnero" },
  { id: "15-usuarios", path: "/usuarios", title: "Usuarios" },
  { id: "16-ajustes", path: "/ajustes", title: "Ajustes" },
  {
    id: "17-portal-propiedades",
    path: "/i/demo-inmobiliaria/propiedades",
    title: "Portal público — listado",
    public: true,
  },
  { id: "20-ventas", path: "/ventas", title: "Ventas" },
  { id: "21-agenda", path: "/agenda", title: "Agenda" },
  { id: "22-cierre-cobros", path: "/cobros", title: "Cobros / cierre" },
];

fs.mkdirSync(OUT_DOCS, { recursive: true });
fs.mkdirSync(OUT_PUBLIC, { recursive: true });

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 20000,
    }),
    page.click('button[type="submit"]'),
  ]);
  // Si eligió org o cayó en dashboard, ok.
  await page.waitForTimeout(800);
}

async function shot(page, id) {
  const fileDocs = path.join(OUT_DOCS, `${id}.png`);
  const filePublic = path.join(OUT_PUBLIC, `${id}.png`);
  await page.screenshot({ path: fileDocs, fullPage: true });
  fs.copyFileSync(fileDocs, filePublic);
  console.log("OK", id);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: "msedge",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "es-AR",
  });
  const page = await context.newPage();

  // Login screen first
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await shot(page, "01-login");

  await login(page);

  for (const s of screens) {
    if (s.id === "01-login") continue;
    try {
      await page.goto(`${BASE}${s.path}`, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      await page.waitForTimeout(600);
      // Evitar overlays de error visibles si hay
      await shot(page, s.id);
    } catch (err) {
      console.error("FAIL", s.id, err.message);
    }
  }

  // Intentar ficha de propiedad en portal
  try {
    await page.goto(`${BASE}/i/demo-inmobiliaria/propiedades`, {
      waitUntil: "networkidle",
    });
    const first = page.locator('a[href*="/propiedades/"]').first();
    if (await first.count()) {
      await first.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      await shot(page, "18-portal-ficha");
    }
  } catch (err) {
    console.error("FAIL portal ficha", err.message);
  }

  // Detalle de propiedad ERP si hay link
  try {
    await page.goto(`${BASE}/gestion/propiedades`, {
      waitUntil: "networkidle",
    });
    const edit = page.locator('a[href*="/gestion/propiedades/"]').first();
    if (await edit.count()) {
      await edit.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      await shot(page, "19-propiedad-detalle");
    }
  } catch (err) {
    console.error("FAIL propiedad detalle", err.message);
  }

  await browser.close();
  console.log("Capturas en", OUT_DOCS, "y", OUT_PUBLIC);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
