import { test, expect } from "@playwright/test";
import { loadFixtures, type E2EFixtures } from "./helpers/fixtures";
import { E2E_PASSWORD } from "./helpers/auth";

test.describe("Portal inquilino E2E", () => {
  let fixtures: E2EFixtures;

  test.beforeAll(() => {
    fixtures = loadFixtures();
  });

  test("login inquilino sandbox y accede a contratos", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixtures.tenantEmail);
    await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/\/(dashboard|contratos|select-organization)/, {
      timeout: 30_000,
    });

    if (page.url().includes("/select-organization")) {
      await page.getByRole("button", { name: fixtures.orgName }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    }

    await page.goto("/contratos");
    await expect(page.locator("body")).not.toContainText("No autorizado");
    await expect(page.locator("body")).toContainText(fixtures.contractCode);
  });
});
