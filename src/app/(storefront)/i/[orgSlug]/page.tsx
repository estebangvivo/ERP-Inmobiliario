import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getPublicOrganization,
  publicPropertiesPath,
} from "@/lib/public-org";
import { BRAND_NAME } from "@/lib/brand";

type Params = Promise<{ orgSlug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await getPublicOrganization(orgSlug);
  if (!org) return { title: "Inmobiliaria no encontrada" };
  return {
    title: `${org.name} | ${BRAND_NAME}`,
    description: `Propiedades de ${org.name}`,
  };
}

export default async function TenantHomePage({ params }: { params: Params }) {
  const { orgSlug } = await params;
  const org = await getPublicOrganization(orgSlug);
  if (!org) notFound();

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(120deg, rgba(16,40,51,0.94), rgba(31,78,95,0.82)), url(https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600) center/cover",
      }}
    >
      <div className="mx-auto flex min-h-[60vh] max-w-6xl flex-col justify-center gap-5 px-6 py-20">
        <p
          className="text-sm uppercase tracking-[0.2em]"
          style={{ color: "rgba(247,250,251,0.65)" }}
        >
          Portal inmobiliario
        </p>
        <h1
          className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl"
          style={{ color: "#f7fafb" }}
        >
          {org.name}
        </h1>
        <p
          className="max-w-xl text-lg"
          style={{ color: "rgba(247,250,251,0.88)" }}
        >
          {org.city
            ? `Propiedades en ${org.city} y alrededores.`
            : "Alquiler y venta de propiedades."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={publicPropertiesPath(org.slug)}>
            <Button
              size="lg"
              className="bg-[#f7fafb] text-[#102833] hover:bg-white"
            >
              Ver propiedades
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
