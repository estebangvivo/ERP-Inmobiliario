"use client";

import { useTransition } from "react";
import { applyLateFeeAction } from "@/server/actions/billing";
import { Button } from "@/components/ui/button";

export function LateFeeButton({ billId }: { billId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => start(() => { void applyLateFeeAction(billId); })}
    >
      {pending ? "Calculando…" : "Recalcular mora"}
    </Button>
  );
}
