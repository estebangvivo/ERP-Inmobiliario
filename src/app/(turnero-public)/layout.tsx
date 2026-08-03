import { prisma } from "@/lib/prisma";
import { DEV_ORG_SLUG } from "@/lib/auth-config";
import { getSession } from "@/lib/auth";
import { DEFAULT_THEME_ID, themeToCssText } from "@/config/themes";
import { TurneroBrandProvider } from "@/features/turnero/components/turnero-brand";
import { TurneroBackToApp } from "@/features/turnero/components/turnero-back-to-app";

export const dynamic = "force-dynamic";

/**
 * Layout público del monitor de sala.
 * No exige login; marca de la org vía sesión o slug público.
 */
export default async function TurneroPantallaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession().catch(() => null);

  let org: {
    name: string;
    logoUrl: string | null;
    themeId: string;
  } | null = null;

  if (session?.organizationId) {
    org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true, logoUrl: true, themeId: true },
    });
  } else {
    const slug =
      process.env.TURNERO_PUBLIC_ORG_SLUG?.trim() || DEV_ORG_SLUG;
    org = await prisma.organization.findUnique({
      where: { slug },
      select: { name: true, logoUrl: true, themeId: true },
    });
  }

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
          {session ? <TurneroBackToApp /> : null}
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </TurneroBrandProvider>
    </>
  );
}
