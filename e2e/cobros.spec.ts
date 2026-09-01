import { test, expect } from "@playwright/test";

test.describe("Cobros", () => {
  test("listado de cobros carga", async ({ page }) => {
    await page.goto("/cobros");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("cuenta corriente listado", async ({ page }) => {
    await page.goto("/cobros/cuenta-corriente");
    await expect(page.locator("body")).toContainText(/inquilino|deuda|Sin/i);
  });

  test("impresión de deuda con desglose si hay deuda", async ({ page }) => {
    await page.goto("/cobros/cuenta-corriente");
    const verDeuda = page.getByRole("link", { name: /Ver deuda/i }).first();
    if (!(await verDeuda.isVisible())) {
      test.skip(true, "No hay inquilinos con deuda en seed");
      return;
    }
    await verDeuda.click();
    await expect(page).toHaveURL(/\/cobros\/cuenta-corriente\//);

    const imprimir = page.getByRole("link", { name: /Imprimir deuda/i });
    if (!(await imprimir.isVisible())) {
      test.skip(true, "Inquilino sin cuotas abiertas");
      return;
    }

    await imprimir.click();
    await expect(page).toHaveURL(/\/print/);
    await expect(page.locator("body")).toContainText("Estado de deuda");
    await expect(page.locator("body")).toContainText("Cuotas pendientes");

    const hasConceptTable = await page.getByText("Concepto").first().isVisible();
    expect(hasConceptTable).toBeTruthy();
  });

  test("PDF de deuda requiere sesión", async ({ page }) => {
    const resAuthed = await page.request.get(
      "/api/cobros/cuenta-corriente/fake-id/pdf",
    );
    expect([401, 403, 404]).toContain(resAuthed.status());

    await page.context().clearCookies();
    const resGuest = await page.request.get(
      "/api/cobros/cuenta-corriente/fake-id/pdf",
    );
    expect(resGuest.status()).toBe(401);
  });
});
