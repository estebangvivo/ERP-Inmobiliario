import { test, expect } from "@playwright/test";

test.describe("Expensas", () => {
  test("listado de expensas y costos carga", async ({ page }) => {
    await page.goto("/expensas");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("No autorizado");
  });

  test("formulario de gastos visible para staff", async ({ page }) => {
    await page.goto("/expensas");
    await expect(page.getByRole("heading", { name: "Gastos del período" })).toBeVisible();
  });
});
