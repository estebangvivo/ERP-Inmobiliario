import type { Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@erp.local";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "demo1234";
export const E2E_ORG_NAME = process.env.E2E_ORG_NAME ?? "Demo E2E";

/** Cambia a la org sandbox E2E (Demo E2E). */
export async function ensureE2EOrganization(page: Page) {
  await page.goto("/select-organization?required=1");
  const orgButton = page.getByRole("button", { name: E2E_ORG_NAME });
  await orgButton.click({ timeout: 15_000 });
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);

  const loginResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/login") &&
      res.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Ingresar" }).click();
  const response = await loginResponse;
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok() || !data.ok) {
    throw new Error(data.error ?? `Login falló (${response.status()})`);
  }

  await page.waitForURL(
    (url) => !url.pathname.includes("/login"),
    { timeout: 30_000 },
  );

  await ensureE2EOrganization(page);
}
