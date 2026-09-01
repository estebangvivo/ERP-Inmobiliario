import { test as setup, expect } from "@playwright/test";
import { join } from "node:path";
import { E2E_EMAIL, E2E_PASSWORD, E2E_ORG_NAME, ensureE2EOrganization } from "./helpers/auth";

const authFile = join(process.cwd(), "e2e", ".auth.json");

setup("autenticar admin demo", async ({ page }) => {
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
  expect(response.ok()).toBeTruthy();

  await ensureE2EOrganization(page);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: authFile });
});
