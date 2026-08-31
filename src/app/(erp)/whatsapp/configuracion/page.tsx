import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import { WhatsAppAgentsPanel } from "@/features/whatsapp/components/whatsapp-agents-panel";
import { WhatsAppOrgSettingsForm } from "@/features/whatsapp/components/whatsapp-org-settings-form";
import { getWhatsAppSettings } from "@/features/whatsapp/queries/get-whatsapp-settings";
import { requireModule, requireOrgAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WhatsAppConfigPage() {
  await requireModule("whatsapp");
  const session = await requireOrgAdmin();
  if (!session.organizationId) redirect("/dashboard");

  const settings = await getWhatsAppSettings(session.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración WhatsApp"
        description="Conectá Meta Business, definí la derivación y los horarios de tus agentes."
        actions={
          <Link
            href="/whatsapp"
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium hover:bg-[var(--muted)]"
          >
            Volver al inbox
          </Link>
        }
      />

      <WhatsAppOrgSettingsForm org={settings.org} />
      <WhatsAppAgentsPanel agents={settings.agents} />
    </div>
  );
}
