/**
 * Smoke de remediación C/A/M — lectura + assertions livianas (sin mutar datos de negocio).
 * Uso: npx tsx scripts/smoke-remediation.ts
 */
import { PrismaClient } from "@prisma/client";
import { formatDateAR } from "../src/lib/format-date";
import { formatDateOnly, toDateInputValue } from "../src/lib/dates";
import { formatMoney as formatMoneyLib } from "../src/lib/money";
import { formatMoney as formatMoneyTreasury } from "../src/features/treasury/lib/labels";

const prisma = new PrismaClient();
const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function pass(name: string, detail?: string) {
  checks.push({ name, ok: true, detail });
}
function fail(name: string, detail: string) {
  checks.push({ name, ok: false, detail });
}

async function httpStatus(path: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

async function main() {
  // --- Fechas / dinero ---
  const utcMidnight = new Date(Date.UTC(2024, 0, 15)); // 15 ene 2024 UTC
  const a = formatDateAR(utcMidnight);
  const b = formatDateOnly(utcMidnight);
  if (a === b && a === "15/01/2024") {
    pass("fechas unificadas", `${a}`);
  } else {
    fail("fechas unificadas", `formatDateAR=${a} formatDateOnly=${b}`);
  }

  const m1 = formatMoneyLib(1234.5, "ARS");
  const m2 = formatMoneyTreasury(1234.5, "ARS");
  if (m1 === m2) pass("formatMoney unificado", m1);
  else fail("formatMoney unificado", `${m1} vs ${m2}`);

  const today = toDateInputValue(new Date());
  if (/^\d{4}-\d{2}-\d{2}$/.test(today)) pass("toDateInputValue", today);
  else fail("toDateInputValue", today);

  // --- Middleware / auth redirect ---
  try {
    for (const path of ["/tesoreria", "/reportes", "/personas"]) {
      const { status, location } = await httpStatus(path);
      const redirected =
        status === 307 || status === 302 || status === 303 || status === 308;
      const toLogin =
        (location ?? "").includes("/login") ||
        (location ?? "").includes("signin");
      if (redirected && toLogin) {
        pass(`middleware ${path}`, `${status} → ${location}`);
      } else if (status === 401 || status === 403) {
        pass(`middleware ${path}`, `${status}`);
      } else {
        fail(
          `middleware ${path}`,
          `status=${status} location=${location ?? "(none)"}`,
        );
      }
    }
  } catch (e) {
    fail("middleware HTTP", e instanceof Error ? e.message : String(e));
  }

  // --- Nav label (archivo fuente) ---
  const navSrc = await import("fs").then((fs) =>
    fs.promises.readFile("src/lib/nav.ts", "utf8"),
  );
  if (navSrc.includes('title: "Inicio"') && !navSrc.includes('title: "Dashboard"')) {
    pass("nav Inicio");
  } else {
    fail("nav Inicio", "sigue apareciendo Dashboard o falta Inicio");
  }

  // --- Código MP webhook no ack silencioso ---
  const wh = await import("fs").then((fs) =>
    fs.promises.readFile(
      "src/app/api/billing/mercadopago/webhook/route.ts",
      "utf8",
    ),
  );
  if (wh.includes("status: 502") && wh.includes("fetchFailed")) {
    pass("MP webhook 502 en fallo fetch");
  } else {
    fail("MP webhook 502 en fallo fetch", "no se encontró status 502");
  }

  if (wh.includes("createMercadoPagoCheckout") || true) {
    const ba = await import("fs").then((fs) =>
      fs.promises.readFile(
        "src/features/billing/actions/billing-actions.ts",
        "utf8",
      ),
    );
    if (ba.includes("createMercadoPagoCheckout") && ba.includes("MERCADOPAGO")) {
      pass("MP preference createMercadoPagoCheckout");
    } else {
      fail("MP preference", "falta createMercadoPagoCheckout");
    }
  }

  // --- TENANT costBearer wiring ---
  const docApp = await import("fs").then((fs) =>
    fs.promises.readFile(
      "src/features/treasury/lib/document-applications.ts",
      "utf8",
    ),
  );
  if (
    docApp.includes("openTenantChargeForSupplierInvoice") &&
    docApp.includes('costBearer === "TENANT"')
  ) {
    pass("TENANT bearer abre cargo en CC");
  } else {
    fail("TENANT bearer", "no cableado en document-applications");
  }

  // --- SaleDeal treasury ---
  const sales = await import("fs").then((fs) =>
    fs.promises.readFile("src/server/actions/sales.ts", "utf8"),
  );
  if (
    sales.includes("syncSaleDealTreasury") &&
    sales.includes("ensureSaleDealReceipt")
  ) {
    pass("SaleDeal sync tesorería");
  } else {
    fail("SaleDeal sync tesorería", "helpers ausentes");
  }

  // --- DB: integridad mínima (solo lectura) ---
  try {
    const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
    if (!org) {
      fail("DB org", "sin organizaciones — seed pendiente");
    } else {
      pass("DB org", org.name);

      const admin = await prisma.user.findFirst({
        where: { email: "admin@erp.local" },
        select: { id: true, isActive: true },
      });
      if (admin?.isActive) pass("DB admin demo", "admin@erp.local");
      else fail("DB admin demo", "usuario ausente o inactivo");

      // Recibos con marker de venta (si hubo deals sync)
      const saleReceipts = await prisma.receipt.count({
        where: {
          organizationId: org.id,
          notes: { contains: "saleDeal:" },
          status: { not: "CANCELLED" },
        },
      });
      pass("DB recibos saleDeal (info)", `count=${saleReceipts}`);

      // Cargos TENANT en notes de bills
      const tenantCharges = await prisma.tenantBill.count({
        where: {
          notes: { contains: "supplierInvoice:" },
          status: { not: "CANCELLED" },
          contract: { organizationId: org.id },
        },
      });
      pass("DB cuotas OT→TENANT (info)", `count=${tenantCharges}`);

    }
  } catch (e) {
    fail("DB", e instanceof Error ? e.message : String(e));
  }

  // --- Login page reachable ---
  try {
    const res = await fetch(`${BASE}/login`);
    if (res.ok) pass("HTTP /login", String(res.status));
    else fail("HTTP /login", String(res.status));
  } catch (e) {
    fail("HTTP /login", e instanceof Error ? e.message : String(e));
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("\n=== SMOKE REMEDIACIÓN ===\n");
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    console.log(`${mark}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  console.log(
    `\nResumen: ${checks.length - failed.length}/${checks.length} ok` +
      (failed.length ? ` · ${failed.length} fallos` : ""),
  );

  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
