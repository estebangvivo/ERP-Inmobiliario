import type { Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@erp.local";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "demo1234";

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
    redirectTo?: string;
  };
  if (!response.ok() || !data.ok) {
    throw new Error(data.error ?? `Login falló (${response.status()})`);
  }

  const dest = data.redirectTo ?? "/dashboard";
  await page.waitForURL(
    (url) =>
      url.pathname === dest || !url.pathname.includes("/login"),
    { timeout: 30_000 },
  );

  if (page.url().includes("/select-organization")) {
    const firstOrg = page.getByRole("button").first();
    if (await firstOrg.isVisible()) {
      await firstOrg.click();
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    }
  }
}
