export const LIST_PAGE_SIZES = [10, 20, 50, 100] as const;
export const LIST_DEFAULT_PAGE_SIZE = 10;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: ListPageSize;
};

export function parseListPage(raw?: string | number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function parseListPageSize(raw?: string | number): ListPageSize {
  const n = Number(raw);
  return (LIST_PAGE_SIZES as readonly number[]).includes(n)
    ? (n as ListPageSize)
    : LIST_DEFAULT_PAGE_SIZE;
}

export function listTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function listPageRange(page: number, pageSize: number, total: number) {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return { from, to };
}

export function prismaSkipTake(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function clampListPage(page: number, total: number, pageSize: number) {
  return Math.min(parseListPage(String(page)), listTotalPages(total, pageSize));
}

export function paginateArray<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const safePage = clampListPage(page, total, pageSize);
  const { skip, take } = prismaSkipTake(safePage, pageSize);
  return { total, page: safePage, items: items.slice(skip, skip + take) };
}

type BuildParamsOpts = {
  pageKey?: string;
  pageSizeKey?: string;
};

/** Arma query string preservando filtros y paginación. */
export function buildListSearchParams(
  current: Record<string, string | undefined>,
  patch: { page?: number; pageSize?: number },
  opts?: BuildParamsOpts,
): string {
  const pageKey = opts?.pageKey ?? "page";
  const pageSizeKey = opts?.pageSizeKey ?? "pageSize";
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(current)) {
    if (v && k !== pageKey && k !== pageSizeKey) {
      params.set(k, v);
    }
  }

  const page =
    patch.page ??
    parseListPage(current[pageKey]) ??
    1;
  const pageSize =
    patch.pageSize ??
    parseListPageSize(current[pageSizeKey]);

  if (page > 1) params.set(pageKey, String(page));
  if (pageSize !== LIST_DEFAULT_PAGE_SIZE) {
    params.set(pageSizeKey, String(pageSize));
  }

  return params.toString();
}

export function listPaginationHref(
  current: Record<string, string | undefined>,
  patch: { page?: number; pageSize?: number },
  opts?: BuildParamsOpts,
): string {
  const qs = buildListSearchParams(current, patch, opts);
  return qs ? `?${qs}` : "";
}
