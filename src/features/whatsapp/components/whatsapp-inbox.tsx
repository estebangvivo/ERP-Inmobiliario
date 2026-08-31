"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ChatThread } from "@/features/whatsapp/components/chat-thread";
import { SessionList } from "@/features/whatsapp/components/session-list";
import { WhatsAppSetupBanner } from "@/features/whatsapp/components/whatsapp-setup-banner";
import { useWhatsAppInboxRealtime } from "@/features/whatsapp/components/use-inbox-realtime";
import type { EligibleWhatsAppAgent } from "@/features/whatsapp/services/agent-eligibility";
import type { MessageListItem, SessionListItem } from "@/features/whatsapp/lib/types";

type ThreadData = {
  session: {
    id: string;
    waContactPhone: string;
    waContactName: string | null;
    status: SessionListItem["status"];
    assignedAgentName: string | null;
    leadId: string | null;
    leadName: string | null;
  };
  messages: MessageListItem[];
};

export function WhatsAppInbox({
  sessions,
  thread,
  selectedSessionId,
  currentUserId,
  configured,
  eligibleAgents = [],
  isAdmin = false,
}: {
  sessions: SessionListItem[];
  thread: ThreadData | null;
  selectedSessionId?: string;
  currentUserId: string;
  configured: boolean;
  eligibleAgents?: EligibleWhatsAppAgent[];
  isAdmin?: boolean;
}) {
  const router = useRouter();

  const onRealtime = useCallback(() => {
    router.refresh();
  }, [router]);

  useWhatsAppInboxRealtime(onRealtime);

  return (
    <div className="space-y-4">
      {!configured ? (
        <WhatsAppSetupBanner isAdmin={isAdmin} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-semibold">Bandeja</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {sessions.filter((s) => s.status === "WAITING_AGENT").length} en
              espera
            </p>
          </div>
          <SessionList
            sessions={sessions}
            selectedId={selectedSessionId}
            currentUserId={currentUserId}
            eligibleAgents={eligibleAgents}
            isAdmin={isAdmin}
          />
        </div>

        <div>
          {thread ? (
            <ChatThread
              session={thread.session}
              messages={thread.messages}
              canReply={configured}
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-sm text-[var(--muted-foreground)]">
              Seleccioná una conversación de la bandeja.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
