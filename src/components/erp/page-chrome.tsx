import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center text-sm text-[var(--muted-foreground)]">
        No hay registros para mostrar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--muted)]/60 text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      className={cn(
        "mb-4 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </form>
  );
}
