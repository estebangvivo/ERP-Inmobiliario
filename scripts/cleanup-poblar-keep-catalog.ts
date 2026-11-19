/**
 * Limpia datos operativos de inmobiliaria Poblar conservando personas y propiedades.
 *
 * Uso:
 *   npx tsx scripts/cleanup-poblar-keep-catalog.ts --dry-run
 *   npx tsx scripts/cleanup-poblar-keep-catalog.ts --dry-run --org inmobiliaria-poblar
 *   npx tsx scripts/cleanup-poblar-keep-catalog.ts --dry-run --url-file .tmp-access-review/railway-db.url
 *   CONFIRM=POBLAR_CLEANUP npx tsx scripts/cleanup-poblar-keep-catalog.ts --execute
 *
 * Requiere DATABASE_URL (o DATABASE_PUBLIC_URL) apuntando a Railway público.
 * Hacé backup en Railway antes de --execute.
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  countOrgCleanupTargets,
  wipeOrgKeepCatalog,
  type OrgCleanupCounts,
} from "./lib/wipe-org-data";

const DEFAULT_ORG_SLUG = "inmobiliaria-poblar";
const CONFIRM_VALUE = "POBLAR_CLEANUP";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function resolveDatabaseUrl(): string {
  const urlFile = arg("--url-file");
  if (urlFile) {
    const fromFile = fs.readFileSync(urlFile, "utf8").trim();
    if (!fromFile) throw new Error(`Archivo vacío: ${urlFile}`);
    return fromFile;
  }
  return (
    process.env.DATABASE_PUBLIC_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ""
  );
}

function printCounts(title: string, counts: OrgCleanupCounts) {
  console.log(`\n=== ${title} ===`);
  console.log("--- Se eliminaría / operativo ---");
  console.log(`  contracts:           ${counts.contracts}`);
  console.log(`  tenantBills:         ${counts.tenantBills}`);
  console.log(`  payments:            ${counts.payments}`);
  console.log(`  receipts:            ${counts.receipts}`);
  console.log(`  paymentOrders:       ${counts.paymentOrders}`);
  console.log(`  settlements:         ${counts.settlements}`);
  console.log(`  workOrders:          ${counts.workOrders}`);
  console.log(`  supplierInvoices:    ${counts.supplierInvoices}`);
  console.log(`  expenses:            ${counts.expenses}`);
  console.log(`  serviceCosts:        ${counts.serviceCosts}`);
  console.log(`  indexRates:          ${counts.indexRates}`);
  console.log(`  leads:               ${counts.leads}`);
  console.log(`  visitBookings:       ${counts.visitBookings}`);
  console.log(`  saleDeals:           ${counts.saleDeals}`);
  console.log(`  whatsappSessions:    ${counts.whatsappSessions}`);
  console.log(`  whatsappMessages:    ${counts.whatsappMessages}`);
  console.log(`  deskThreads:         ${counts.deskThreads}`);
  console.log(`  turneroTurnos:       ${counts.turneroTurnos}`);
  console.log(`  checkInstruments:    ${counts.checkInstruments}`);
  console.log(`  bankMovements:       ${counts.bankMovements}`);
  console.log(`  cashMovements:       ${counts.cashMovements}`);
  console.log("--- Se conserva (catálogo) ---");
  console.log(`  members (personas):  ${counts.members}`);
  console.log(`  properties:          ${counts.properties}`);
  console.log(`  propertiesRented→AV: ${counts.propertiesRented}`);
  console.log(`  ownerships:          ${counts.ownerships}`);
  console.log(`  complexes:           ${counts.complexes}`);
  console.log(`  units:               ${counts.units}`);
}

async function resolveOrg(prisma: PrismaClient, slug: string) {
  const org =
    (await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    })) ??
    (await prisma.organization.findFirst({
      where: {
        OR: [
          { slug: { contains: "poblar", mode: "insensitive" } },
          { name: { contains: "poblar", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true },
    }));

  if (!org) {
    throw new Error(
      `No se encontró la organización (slug=${slug}). Probá --org <slug>.`,
    );
  }
  return org;
}

async function main() {
  const dryRun = hasFlag("--dry-run") || !hasFlag("--execute");
  const execute = hasFlag("--execute");
  const orgSlug = arg("--org") ?? DEFAULT_ORG_SLUG;

  if (execute && dryRun && hasFlag("--dry-run")) {
    // Si pasan ambos, priorizar dry-run por seguridad.
    console.warn("Se indicó --dry-run y --execute: se ejecuta solo dry-run.");
  }

  const doExecute = execute && !hasFlag("--dry-run");

  const dbUrl = resolveDatabaseUrl();
  if (!dbUrl) {
    throw new Error(
      "Falta DATABASE_URL / DATABASE_PUBLIC_URL (o --url-file <path>).",
    );
  }
  if (dbUrl.includes("railway.internal")) {
    throw new Error(
      "DATABASE_URL apunta a railway.internal (solo dentro de Railway). Usá DATABASE_PUBLIC_URL (*.proxy.rlwy.net).",
    );
  }

  // Evitar que dotenv pise el URL explícito.
  process.env.DATABASE_URL = dbUrl;
  process.env.DATABASE_PUBLIC_URL = dbUrl;

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });
  try {
    const org = await resolveOrg(prisma, orgSlug);
    console.log(`Organización: ${org.name} (${org.slug}) id=${org.id}`);
    console.log(`Modo: ${doExecute ? "EXECUTE" : "DRY-RUN"}`);

    const before = await countOrgCleanupTargets(prisma, org.id);
    printCounts("Antes", before);

    if (!doExecute) {
      console.log(
        "\nDry-run OK. Para ejecutar de verdad (después de backup en Railway):",
      );
      console.log(
        `  CONFIRM=${CONFIRM_VALUE} npx tsx scripts/cleanup-poblar-keep-catalog.ts --execute --org ${org.slug}`,
      );
      return;
    }

    if (process.env.CONFIRM !== CONFIRM_VALUE) {
      throw new Error(
        `Confirmación requerida: CONFIRM=${CONFIRM_VALUE} (y backup previo en Railway).`,
      );
    }

    console.log("\nEjecutando wipeOrgKeepCatalog en transacción…");
    await prisma.$transaction(
      async (tx) => {
        await wipeOrgKeepCatalog(tx, org.id);
      },
      { timeout: 300_000 },
    );

    const after = await countOrgCleanupTargets(prisma, org.id);
    printCounts("Después", after);

    const leftoverOps =
      after.contracts +
      after.tenantBills +
      after.payments +
      after.receipts +
      after.paymentOrders +
      after.settlements +
      after.workOrders +
      after.leads +
      after.whatsappSessions;

    if (leftoverOps > 0) {
      throw new Error(
        `Quedaron ${leftoverOps} registros operativos; revisá el resultado.`,
      );
    }
    if (after.properties === 0 || after.members === 0) {
      throw new Error(
        "Catálogo vacío tras la limpieza (properties o members = 0). Algo salió mal.",
      );
    }

    console.log("\nLimpieza completada OK.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
