"use client";

import { useTransition } from "react";
import { LeadStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { LEAD_STATUS_LABELS } from "@/lib/labels";
import { updateLeadStatusAction } from "@/server/actions/leads";

const NEXT: Partial<Record<LeadStatus, LeadStatus>> = {
  NEW: "CONTACTED",
  CONTACTED: "QUALIFIED",
  QUALIFIED: "CONVERTED",
};

export function LeadStatusButton({
  id,
  status,
}: {
  id: string;
  status: LeadStatus;
}) {
  const [pending, start] = useTransition();
  const next = NEXT[status];
  if (!next) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(() => { void updateLeadStatusAction(id, next); })}
    >
      → {LEAD_STATUS_LABELS[next]}
    </Button>
  );
}
