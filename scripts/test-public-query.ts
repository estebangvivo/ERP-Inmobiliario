import { PrismaClient, Prisma } from "@prisma/client";

const p = new PrismaClient();

function publicOrganizationPropertyFilter(): Prisma.PropertyWhereInput {
  return {
    organization: {
      billingStatus: { in: ["ACTIVE", "EXEMPT"] },
    },
  };
}

async function main() {
  try {
    const where: Prisma.PropertyWhereInput = {
      status: { in: ["AVAILABLE", "RESERVED"] },
      publishedAt: { not: null },
      AND: [
        publicOrganizationPropertyFilter(),
        {},
        {},
        {},
        {},
        {},
        {},
      ],
    };

    const properties = await p.property.findMany({
      where,
      include: {
        images: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
      },
      orderBy: { publishedAt: "desc" },
    });
    console.log("properties ok", properties.length);

    const cities = await p.property.findMany({
      where: {
        status: { in: ["AVAILABLE", "RESERVED"] },
        publishedAt: { not: null },
        ...publicOrganizationPropertyFilter(),
      },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    });
    console.log("cities ok", cities.length);
  } catch (e) {
    console.error("ERR:", e instanceof Error ? e.message : e);
  } finally {
    await p.$disconnect();
  }
}

main();
