import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import { DeskChatPanel } from "@/features/whatsapp/components/desk-chat-panel";
import {
  getDeskThreadAction,
  getWhatsAppContextForDeskAction,
  listDeskAgentsAction,
  listDeskThreadsAction,
} from "@/features/whatsapp/actions/desk-actions";
import { requireModule, requireStaff } from "@/lib/session";

type SearchParams = Promise<{ thread?: string; from?: string }>;

export default async function WhatsAppEquipoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const params = await searchParams;
  const threadId = params.thread?.trim();
  const fromSessionId = params.from?.trim();

  const [threads, thread, agents, prefill] = await Promise.all([
    listDeskThreadsAction(),
    threadId ? getDeskThreadAction(threadId) : Promise.resolve(null),
    listDeskAgentsAction(),
    fromSessionId
      ? getWhatsAppContextForDeskAction(fromSessionId)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipo"
        description="Chat interno entre agentes. Podés adjuntar el contexto de un chat de WhatsApp."
        actions={
          <Link
            href="/whatsapp"
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium hover:bg-[var(--muted)]"
          >
            Volver al inbox
          </Link>
        }
      />
      <DeskChatPanel
        threads={threads}
        thread={thread}
        agents={agents}
        currentUserId={session.user.id}
        selectedThreadId={threadId}
        prefill={
          prefill
            ? {
                sessionId: prefill.sessionId,
                title: prefill.title,
                summary: prefill.summary,
              }
            : null
        }
      />
    </div>
  );
}
