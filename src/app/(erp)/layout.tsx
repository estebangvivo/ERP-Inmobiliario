import { requireSession, isStaffRole } from "@/lib/session";
import { ErpShell } from "@/components/erp/shell";
import { prisma } from "@/lib/prisma";
import { DEFAULT_THEME_ID, themeToCssText } from "@/config/themes";
import { hasModule } from "@/features/auth/lib/modules";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";
import { organizationLogoSrc } from "@/features/settings/lib/organization-logo";
import { countUnreadDeskThreads } from "@/features/whatsapp/services/desk-chat-service";

export const dynamic = "force-dynamic";

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  const enableMessageNotifications =
    isStaffRole(session.organizationRole) &&
    (session.organizationRole === "ADMIN" ||
      hasModule(session.allowedModules, "whatsapp"));

  const [organization, initialDeskUnread] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { themeId: true, name: true, logoUrl: true },
    }),
    enableMessageNotifications
      ? countUnreadDeskThreads(session.organizationId, session.user.id)
      : Promise.resolve(0),
  ]);

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
        userId={session.user.id}
        userName={session.user.name}
        organizationName={organization?.name ?? "Inmobiliaria"}
        organizationLogoSrc={organizationLogoSrc(organization?.logoUrl)}
        showAdminNav={isPlatformSuperadminEmail(session.user.email)}
        enableMessageNotifications={enableMessageNotifications}
        initialDeskUnread={initialDeskUnread}
      >
        {children}
      </ErpShell>
    </>
  );
}
