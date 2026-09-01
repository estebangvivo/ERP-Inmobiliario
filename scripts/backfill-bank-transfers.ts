/**
 * Crea movimientos bancarios faltantes para recibos/OP imputados por transferencia.
 *
 * Uso:
 *   npx tsx scripts/backfill-bank-transfers.ts --org inmobiliaria-poblar
 *   npx tsx scripts/backfill-bank-transfers.ts --org inmobiliaria-poblar --dry-run
 *   npx tsx scripts/backfill-bank-transfers.ts --org inmobiliaria-poblar --bank "Banco Nacion"
 */
import { PrismaClient } from "@prisma/client";
import { postBankMovementsFromTreasuryDoc } from "../src/features/treasury/lib/bank-from-treasury";

const prisma = new PrismaClient();

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const orgSlug = arg("--org");
const dryRun = process.argv.includes("--dry-run");
const bankName = arg("--bank");

async function resolveDefaultBank(orgId: string) {
  if (bankName) {
    const bank = await prisma.bankAccount.findFirst({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [{ name: bankName }, { bankName }],
      },
    });
    if (!bank) {
      throw new Error(`No se encontró cuenta bancaria "${bankName}".`);
    }
    return bank;
  }

  const banks = await prisma.bankAccount.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { name: "asc" },
  });
  if (banks.length === 1) return banks[0]!;
  if (banks.length === 0) {
    throw new Error("La organización no tiene cuentas bancarias activas.");
  }
  throw new Error(
    `Hay ${banks.length} cuentas activas. Indicá una con --bank "Nombre".`,
  );
}

async function backfillReceipts(orgId: string, defaultBankId: string) {
  const receipts = await prisma.receipt.findMany({
    where: { organizationId: orgId, status: "POSTED" },
    include: { payments: true },
  });

  let updated = 0;
  for (const doc of receipts) {
    const hasBank = await prisma.bankMovement.count({
      where: {
        receiptId: doc.id,
        type: { in: ["INCOME", "EXPENSE"] },
      },
    });
    if (hasBank > 0) continue;

    const payments =
      doc.payments.length > 0
        ? doc.payments
        : doc.paymentMethod === "TRANSFER"
          ? [
              {
                method: "TRANSFER" as const,
                amount: doc.totalAmount,
                bankAccountId: defaultBankId,
              },
            ]
          : [];

    const transferPayments = payments.filter((p) => p.method === "TRANSFER");
    if (transferPayments.length === 0) continue;

    const normalized = transferPayments.map((p) => ({
      method: p.method,
      amount: p.amount,
      bankAccountId: p.bankAccountId ?? defaultBankId,
    }));

    if (normalized.some((p) => !p.bankAccountId)) continue;

    console.log(
      `${dryRun ? "[dry-run] " : ""}Recibo ${doc.number}: ${normalized
        .map((p) => `$${p.amount}`)
        .join(" + ")}`,
    );

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        await postBankMovementsFromTreasuryDoc(tx, {
          organizationId: orgId,
          currency: doc.currency,
          kind: "INCOME",
          description: `Recibo ${doc.number}${doc.partyName ? ` · ${doc.partyName}` : ""}`,
          receiptId: doc.id,
          payments: normalized,
        });
      });
    }
    updated += 1;
  }
  return updated;
}

async function main() {
  if (!orgSlug) {
    throw new Error("Indicá --org <slug>, por ejemplo --org inmobiliaria-poblar");
  }

  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true, name: true },
  });
  if (!org) throw new Error(`Organización no encontrada: ${orgSlug}`);

  const bank = await resolveDefaultBank(org.id);
  console.log(`Org: ${org.name} (${orgSlug})`);
  console.log(`Cuenta default: ${bank.name}${bank.bankName ? ` · ${bank.bankName}` : ""}`);

  const count = await backfillReceipts(org.id, bank.id);
  console.log(`${dryRun ? "Se actualizarían" : "Actualizados"}: ${count} recibos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
