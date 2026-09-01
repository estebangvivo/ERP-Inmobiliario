import { test, expect } from "@playwright/test";
import { loadFixtures, type E2EFixtures } from "./helpers/fixtures";

test.describe("Contrato nuevo", () => {
  let fixtures: E2EFixtures;

  test.beforeAll(() => {
    fixtures = loadFixtures();
  });

  test("formulario de alta carga con propiedad disponible E2E", async ({ page }) => {
    await page.goto("/contratos/nuevo");
    await expect(page.getByRole("heading", { name: /Nuevo contrato/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(fixtures.availablePropertyTitle);
  });
});
