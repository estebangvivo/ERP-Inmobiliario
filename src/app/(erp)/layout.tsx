import { requireSession } from "@/lib/session";
import { ErpShell } from "@/components/erp/shell";
import { prisma } from "@/lib/prisma";
import { DEFAULT_THEME_ID, themeToCssText } from "@/config/themes";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";
import { organizationLogoSrc } from "@/features/settings/lib/organization-logo";

export const dynamic = "force-dynamic";

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  const organization = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { themeId: true, name: true, logoUrl: true },
  });

  const themeId = organization?.themeId ?? DEFAULT_THEME_ID;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html{${themeToCssText(themeId)}}`,
        }}
      />
      <ErpShell
        organizationRole={session.organizationRole}
        allowedModules={session.allowedModules}
        userName={session.user.name}
        organizationName={organization?.name ?? "Inmobiliaria"}
        organizationLogoSrc={organizationLogoSrc(organization?.logoUrl)}
        showAdminNav={isPlatformSuperadminEmail(session.user.email)}
      >
        {children}
      </ErpShell>
    </>
  );
}
