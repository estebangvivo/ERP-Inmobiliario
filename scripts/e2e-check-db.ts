import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orgCount = await prisma.organization.count();
  const userCount = await prisma.user.count({ where: { email: "admin@erp.local" } });
  console.log(JSON.stringify({ ok: true, orgCount, adminUser: userCount > 0 }));
}

main()
  .catch((e: Error) => {
    console.error(JSON.stringify({ ok: false, error: e.message }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
