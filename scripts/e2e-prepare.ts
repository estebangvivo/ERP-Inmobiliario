/**
 * Prepara el sandbox E2E aislado (org demo-e2e) y escribe e2e/.fixtures.json.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { resetE2ESandbox } from "./lib/e2e-sandbox";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@erp.local" },
    select: { id: true },
  });
  if (!admin) {
    throw new Error("Usuario admin@erp.local no encontrado. Ejecutá: npm run db:seed");
  }

  const fixtures = await resetE2ESandbox(prisma);

  const outPath = join(process.cwd(), "e2e", ".fixtures.json");
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
  console.log("E2E sandbox listo:", outPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
