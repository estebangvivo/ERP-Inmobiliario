import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/features/auth/lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = "adminesteban@bunas.com.ar";
  const password = "SebaEmma0210$";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No existe el usuario ${email}`);
  }

  const hash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });
  console.log("Password actualizada para", email);

  let puesto = await prisma.turneroPuesto.findFirst({
    where: { nombre: "Caja 1", categoria: "CAJA", activo: true },
  });

  if (!puesto) {
    const org =
      (await prisma.organization.findFirst({
        where: { slug: "demo-inmobiliaria" },
      })) ?? (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } }));
    if (!org) throw new Error("No hay organizaciones");

    puesto = await prisma.turneroPuesto.upsert({
      where: {
        organizationId_nombre: {
          organizationId: org.id,
          nombre: "Caja 1",
        },
      },
      create: {
        organizationId: org.id,
        nombre: "Caja 1",
        categoria: "CAJA",
        activo: true,
      },
      update: { categoria: "CAJA", activo: true },
    });
    console.log("Puesto creado/asegurado:", puesto.id, org.slug);
  } else {
    console.log("Puesto encontrado:", puesto.id, puesto.nombre);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: puesto.organizationId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    await prisma.organizationMember.create({
      data: {
        organizationId: puesto.organizationId,
        userId: user.id,
        role: "ADMIN",
        allowedModules: [],
        turneroPuestoId: puesto.id,
      },
    });
    console.log("Membresía creada con puesto Caja 1");
  } else {
    await prisma.organizationMember.update({
      where: { id: membership.id },
      data: { turneroPuestoId: puesto.id },
    });
    console.log("Membresía actualizada con puesto Caja 1");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
