export const PLATFORM_EXPENSE_CATEGORIES = [
  "HOSTING",
  "DEVELOPMENT",
  "TOOLS",
  "DOMAIN",
  "MARKETING",
  "SUPPORT",
  "OTHER",
] as const;

export type PlatformExpenseCategory =
  (typeof PLATFORM_EXPENSE_CATEGORIES)[number];

export const PLATFORM_EXPENSE_CATEGORY_LABEL: Record<
  PlatformExpenseCategory,
  string
> = {
  HOSTING: "Hosting",
  DEVELOPMENT: "Desarrollo",
  TOOLS: "Herramientas",
  DOMAIN: "Dominio / DNS",
  MARKETING: "Marketing",
  SUPPORT: "Soporte",
  OTHER: "Otros",
};

export function isPlatformExpenseCategory(
  value: string,
): value is PlatformExpenseCategory {
  return (PLATFORM_EXPENSE_CATEGORIES as readonly string[]).includes(value);
}
