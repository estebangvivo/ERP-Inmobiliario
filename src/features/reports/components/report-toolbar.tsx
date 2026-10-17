"use client";

import { Button } from "@/components/ui/button";

export function ReportToolbar({
  csvHref,
}: {
  csvHref?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {csvHref ? (
        <a href={csvHref}>
          <Button type="button" size="sm" variant="outline">
            Descargar CSV
          </Button>
        </a>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => window.print()}
      >
        Imprimir
      </Button>
    </div>
  );
}
