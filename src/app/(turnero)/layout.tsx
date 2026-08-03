import { redirect } from "next/navigation";
import { getOrganizationSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_THEME_ID, themeToCssText } from "@/config/themes";
import { TurneroBrandProvider } from "@/features/turnero/components/turnero-brand";
import { TurneroBackToApp } from "@/features/turnero/components/turnero-back-to-app";

export const dynamic = "force-dynamic";

/**
 * Layout kiosk autenticado (tótem, operador, hub).
 * La pantalla pública vive en (turnero-public).
 */
export default async function TurneroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOrganizationSession().catch(() => null);
  if (!session) {
    redirect("/login?callbackUrl=/turnero");
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { name: true, logoUrl: true, themeId: true },
  });

  const themeId = org?.themeId ?? DEFAULT_THEME_ID;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html{${themeToCssText(themeId)}}`,
        }}
      />
      <TurneroBrandProvider
        brand={{
          name: org?.name ?? "Turnero",
          logoUrl: org?.logoUrl ?? null,
        }}
      >
        <div className="flex min-h-dvh min-h-screen flex-col bg-[var(--turnero-bg)] text-white">
          <TurneroBackToApp />
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </TurneroBrandProvider>
    </>
  );
}
