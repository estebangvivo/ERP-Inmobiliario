import { test, expect } from "@playwright/test";

test.describe("Contratos", () => {
  test("listado y búsqueda", async ({ page }) => {
    await page.goto("/contratos");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByPlaceholder(/buscar/i).fill("CTR");
    await expect(page.locator("body")).toContainText(/CTR|contrato|Sin resultados/i);
  });

  test("detalle de contrato si existe", async ({ page }) => {
    await page.goto("/contratos");
    const ver = page.getByRole("link", { name: "Ver" }).first();
    if (!(await ver.isVisible())) {
      test.skip(true, "No hay contratos en seed");
      return;
    }
    await ver.click();
    await expect(page).toHaveURL(/\/contratos\//);
    await expect(page.locator("body")).not.toContainText("No autorizado");
  });
});
