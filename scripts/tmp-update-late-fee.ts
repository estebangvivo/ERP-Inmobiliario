import { PrismaClient } from "@prisma/client";

const ORG_ID = "cmsjb34ou0000mg4els0p1f4j";
const LATE_FEE_PCT = 1.2;

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({
    where: { id: ORG_ID },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    throw new Error(`Organización no encontrada: ${ORG_ID}`);
  }

  const before = await prisma.contract.count({
    where: { organizationId: ORG_ID },
  });
  const notYet = await prisma.contract.count({
    where: {
      organizationId: ORG_ID,
      NOT: { lateFeeDailyRatePct: LATE_FEE_PCT },
    },
  });

  const result = await prisma.contract.updateMany({
    where: { organizationId: ORG_ID },
    data: { lateFeeDailyRatePct: LATE_FEE_PCT },
  });

  console.log(`Organización: ${org.name} (${org.slug})`);
  console.log(`Contratos totales: ${before}`);
  console.log(`Con mora distinta de ${LATE_FEE_PCT}% antes: ${notYet}`);
  console.log(`Contratos actualizados: ${result.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
