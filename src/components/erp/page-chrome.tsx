import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LIST_DEFAULT_PAGE_SIZE,
  LIST_PAGE_SIZES,
  listPageRange,
  listPaginationHref,
  listTotalPages,
} from "@/lib/list-pagination";

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
      method="get"
      className={cn(
        "mb-4 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </form>
  );
}

export function ListPagination({
  page,
  pageSize,
  total,
  params = {},
  pageKey = "page",
  pageSizeKey = "pageSize",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  params?: Record<string, string | undefined>;
  pageKey?: string;
  pageSizeKey?: string;
  className?: string;
}) {
  const totalPages = listTotalPages(total, pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const { from, to } = listPageRange(safePage, pageSize, total);

  const baseParams = {
    ...params,
    [pageKey]: safePage > 1 ? String(safePage) : undefined,
    [pageSizeKey]:
      pageSize !== LIST_DEFAULT_PAGE_SIZE ? String(pageSize) : undefined,
  };

  if (total === 0) return null;

  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-[var(--muted-foreground)]">
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
          <span>Por página:</span>
          {LIST_PAGE_SIZES.map((size) => {
            const active = size === pageSize;
            const href = listPaginationHref(
              baseParams,
              { page: 1, pageSize: size },
              { pageKey, pageSizeKey },
            );
            return active ? (
              <span key={size} className="font-medium text-[var(--foreground)]">
                {size}
              </span>
            ) : (
              <Link
                key={size}
                href={href || "?"}
                className="text-[var(--primary)] hover:underline"
              >
                {size}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {safePage > 1 ? (
            <Link
              href={
                listPaginationHref(
                  baseParams,
                  { page: safePage - 1, pageSize },
                  { pageKey, pageSizeKey },
                ) || "?"
              }
            >
              <Button type="button" size="sm" variant="outline">
                Anterior
              </Button>
            </Link>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled>
              Anterior
            </Button>
          )}
          <span className="min-w-[7rem] text-center text-[var(--muted-foreground)]">
            Página {safePage} de {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link
              href={
                listPaginationHref(
                  baseParams,
                  { page: safePage + 1, pageSize },
                  { pageKey, pageSizeKey },
                ) || "?"
              }
            >
              <Button type="button" size="sm" variant="outline">
                Siguiente
              </Button>
            </Link>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled>
              Siguiente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
