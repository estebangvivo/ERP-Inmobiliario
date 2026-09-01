import { test, expect } from "@playwright/test";
import { loadFixtures, type E2EFixtures } from "./helpers/fixtures";

test.describe("Contratos", () => {
  let fixtures: E2EFixtures;

  test.beforeAll(() => {
    fixtures = loadFixtures();
  });

  test("listado y búsqueda", async ({ page }) => {
    await page.goto("/contratos");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByPlaceholder(/buscar/i).fill("CTR");
    await expect(page.locator("body")).toContainText(/CTR|contrato|Sin resultados/i);
  });

  test("detalle de contrato si existe", async ({ page }) => {
    await page.goto("/contratos");
    const row = page.getByRole("row", { name: new RegExp(fixtures.contractCode) });
    await expect(row).toBeVisible();
    const ver = row.locator('a[href^="/contratos/"]');
    await ver.click();
    await expect(page).toHaveURL(/\/contratos\/[^/]+$/);
    await expect(page.locator("body")).not.toContainText("No autorizado");
  });
});
