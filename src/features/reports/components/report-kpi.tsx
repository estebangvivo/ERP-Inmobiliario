import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyByCurrency } from "@/config/currencies";

export function ReportKpi({
  label,
  totals,
  hint,
}: {
  label: string;
  totals: Record<string, number>;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        <CardTitle className="text-lg">{formatMoneyByCurrency(totals)}</CardTitle>
        {hint ? (
          <p className="text-[11px] text-[var(--muted-foreground)]">{hint}</p>
        ) : null}
      </CardHeader>
      <CardContent className="hidden" />
    </Card>
  );
}
