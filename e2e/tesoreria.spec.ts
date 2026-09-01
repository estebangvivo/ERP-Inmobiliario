import { test, expect } from "@playwright/test";

test.describe("Tesorería", () => {
  test("hub tesorería", async ({ page }) => {
    await page.goto("/tesoreria");
    await expect(page.locator("body")).not.toContainText("No autorizado");
  });

  test("recibos listado", async ({ page }) => {
    await page.goto("/tesoreria/recibos");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("cuentas inquilinos", async ({ page }) => {
    await page.goto("/tesoreria/cuentas");
    await expect(page.locator("body")).toContainText(/inquilino|cuenta|deuda/i);
  });

  test("caja diaria muestra saldo", async ({ page }) => {
    await page.goto("/tesoreria/caja");
    await expect(page.getByTestId("daily-cash-balance")).toBeVisible();
  });
});
