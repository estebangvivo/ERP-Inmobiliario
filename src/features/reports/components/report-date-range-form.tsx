"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";

export function ReportDateRangeForm({
  basePath,
  fromInput,
  toInput,
  extraActions,
}: {
  basePath: string;
  fromInput: string;
  toInput: string;
  extraActions?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [desde, setDesde] = useState(fromInput);
  const [hasta, setHasta] = useState(toInput);

  function apply() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="space-y-1">
        <Label className="text-xs">Desde</Label>
        <DateInput value={desde} onChange={setDesde} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hasta</Label>
        <DateInput value={hasta} onChange={setHasta} />
      </div>
      <Button type="button" size="sm" disabled={pending} onClick={apply}>
        {pending ? "Aplicando…" : "Aplicar"}
      </Button>
      {extraActions}
    </div>
  );
}
