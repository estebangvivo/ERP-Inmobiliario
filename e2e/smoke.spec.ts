import { test, expect } from "@playwright/test";

test.describe("Smoke ERP", () => {
  test("dashboard carga", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).not.toContainText("No autorizado");
  });

  test("navegación módulos principales", async ({ page }) => {
    const routes = [
      { path: "/gestion/propiedades", label: "Propiedades" },
      { path: "/complejos", label: "Complejos" },
      { path: "/contratos", label: "Contratos" },
      { path: "/cobros", label: "Cobros" },
      { path: "/tesoreria", label: "Tesorería" },
      { path: "/expensas", label: "Expensas" },
      { path: "/rendiciones", label: "Rendiciones" },
      { path: "/leads", label: "Consultas" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page).toHaveURL(new RegExp(route.path.replace("/", "\\/")));
      await expect(page.locator("body")).not.toContainText("No autorizado");
    }
  });

  test("portal público demo", async ({ page }) => {
    await page.goto("/i/demo-inmobiliaria/propiedades");
    await expect(page.locator("body")).not.toContainText("404");
  });

  test("health API", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
  });
});
