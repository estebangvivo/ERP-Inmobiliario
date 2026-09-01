import { test, expect } from "@playwright/test";
import { loadFixtures, type E2EFixtures } from "./helpers/fixtures";

test.describe("Expensas E2E", () => {
  let fixtures: E2EFixtures;
  const now = new Date();

  test.beforeAll(() => {
    fixtures = loadFixtures();
  });

  test("cargar gasto de servicio en edificio E2E", async ({ page }) => {
    await page.goto("/expensas");
    const form = page.getByTestId("service-cost-form");
    await expect(form).toBeVisible();

    await form.locator('select[name="scope"]').selectOption("complex");
    await form.locator('select[name="complexId"]').selectOption(fixtures.complexId);
    await form.locator('input[name="periodYear"]').fill(String(now.getFullYear()));
    await form.locator('input[name="periodMonth"]').fill(String(now.getMonth() + 1));
    await form.locator('select[name="category"]').selectOption("WATER");
    await form.locator('input[name="concept"]').fill("Agua E2E");
    await form.locator('input[name="amount"]').fill("15000");
    await form.getByRole("button", { name: /Cargar gasto/i }).click();

    await expect(page.locator("body")).toContainText("Agua E2E", {
      timeout: 30_000,
    });
  });
});
