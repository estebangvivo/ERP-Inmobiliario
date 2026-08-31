import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import { WhatsAppInbox } from "@/features/whatsapp/components/whatsapp-inbox";
import { isWhatsAppConfiguredForOrg } from "@/features/whatsapp/lib/config";
import {
  getWhatsAppThreadAction,
  listWhatsAppSessionsAction,
} from "@/features/whatsapp/actions/inbox-actions";
import { listWhatsAppEligibleAgents } from "@/features/whatsapp/services/agent-eligibility";
import { requireModule, requireStaff } from "@/lib/session";

type SearchParams = Promise<{ session?: string }>;

async function loadEligibleAgents(organizationId: string) {
  try {
    return await listWhatsAppEligibleAgents(organizationId);
  } catch {
    return [];
  }
}

export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const params = await searchParams;
  const selectedSessionId = params.session?.trim();

  const [sessions, thread, eligibleAgents, configured] = await Promise.all([
    listWhatsAppSessionsAction(),
    selectedSessionId
      ? getWhatsAppThreadAction(selectedSessionId)
      : Promise.resolve(null),
    session.organizationRole === "ADMIN"
      ? loadEligibleAgents(session.organizationId)
      : Promise.resolve([]),
    isWhatsAppConfiguredForOrg(session.organizationId),
  ]);

  const isAdmin = session.organizationRole === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Inbox multiagente con bot de calificación y derivación a asesores."
        actions={
          isAdmin ? (
            <Link
              href="/whatsapp/configuracion"
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium hover:bg-[var(--muted)]"
            >
              Configuración
            </Link>
          ) : undefined
        }
      />
      <WhatsAppInbox
        sessions={sessions}
        thread={thread}
        selectedSessionId={selectedSessionId}
        currentUserId={session.user.id}
        configured={configured}
        eligibleAgents={eligibleAgents}
        isAdmin={isAdmin}
      />
    </div>
  );
}
