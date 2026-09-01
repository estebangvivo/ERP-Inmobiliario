import { test, expect } from "@playwright/test";
import { loadFixtures } from "../helpers/fixtures";

test.describe.configure({ mode: "serial" });

function parseMoney(text: string): number {
  const digits = text.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(digits) || 0;
}

test.describe("Flujos transversales", () => {
  const fixtures = loadFixtures();
  let receiptNumber: string | null = null;
  let receiptId: string | null = null;

  test("cobro completo: cuota → pago → recibo", async ({ page }) => {
    await page.goto(`/cobros/${fixtures.billId}`);
    await expect(page.locator("body")).toContainText(fixtures.contractCode);

    const balance = await page.locator("#amount").inputValue();
    expect(Number(balance)).toBe(fixtures.billTotalAmount);

    await page.locator("#method").selectOption("CASH");
    await page.getByTestId("payment-submit").click();

    await expect(page.getByTestId("payment-success")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("payment-success")).toContainText(/Recibo\s+[\w-]+\s+generado/i);

    const text = (await page.getByTestId("payment-success").textContent()) ?? "";
    const match = text.match(/Recibo\s+([\w-]+)\s+generado/i);
    expect(match).toBeTruthy();
    receiptNumber = match![1]!;

    const printLink = page.getByRole("link", {
      name: /Abrir recibo para imprimir/i,
    });
    await expect(printLink).toBeVisible();
    const href = await printLink.getAttribute("href");
    expect(href).toMatch(/\/tesoreria\/recibos\//);
    receiptId = href?.match(/\/tesoreria\/recibos\/([^/]+)/)?.[1] ?? null;

    await page.goto("/tesoreria/caja");
    const balanceText = await page.getByTestId("daily-cash-balance").textContent();
    const currentBalance = parseMoney(balanceText ?? "0");
    expect(currentBalance).toBeGreaterThanOrEqual(
      fixtures.dailyCashBalanceBefore + fixtures.billTotalAmount - 1,
    );
  });

  test("recibo en tesorería con PDF", async ({ page }) => {
    test.skip(!receiptNumber, "Depende del cobro anterior");

    await page.goto("/tesoreria/recibos");
    await expect(page.getByText(receiptNumber!).first()).toBeVisible({
      timeout: 15_000,
    });

    if (receiptId) {
      await page.goto(`/tesoreria/recibos/${receiptId}`);
      await expect(page.locator("body")).toContainText(receiptNumber!);
      await expect(page.locator("body")).toContainText(/Imputado|Emitido|POSTED|ISSUED/i);

      const pdf = await page.request.get(`/api/tesoreria/recibos/${receiptId}/pdf`);
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
    }
  });

  test("rendición: generar → emitir → pagar (OP)", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!receiptNumber, "Depende del cobro anterior");

    await page.goto("/rendiciones");

    await page.locator("#ownerId").click();
    await page.getByLabel("Nombre, DNI o email…").fill(fixtures.ownerName);
    await page.getByRole("button", { name: fixtures.ownerName }).click();

    await page.getByTestId("generate-settlement-year").fill(
      String(fixtures.settlementPeriodYear),
    );
    await page.getByTestId("generate-settlement-month").fill(
      String(fixtures.settlementPeriodMonth),
    );
    await page.getByTestId("generate-settlement-submit").click();
    await expect(page.getByTestId("generate-settlement-submit")).toBeEnabled({
      timeout: 30_000,
    });

    const ownerRow = page
      .locator("tr", { hasText: fixtures.ownerName })
      .filter({
        hasText: `${fixtures.settlementPeriodMonth}/${fixtures.settlementPeriodYear}`,
      })
      .first();
    await expect(ownerRow).toBeVisible({ timeout: 30_000 });
    await ownerRow.getByRole("link", { name: "Ver" }).click();
    await expect(page).toHaveURL(/\/rendiciones\/[^/]+/);

    await expect(page.locator("body")).toContainText(/Neto a pagar/i);
    await expect(page.locator("body")).not.toContainText(
      "La rendición no tiene neto a pagar",
    );

    const emitir = page.getByRole("button", { name: "Emitir" });
    if (await emitir.isVisible()) {
      await emitir.click();
      await expect(page.getByTestId("settlement-pay-submit")).toBeVisible({
        timeout: 15_000,
      });
    }

    await page.locator("#method").selectOption("CASH");
    await page.getByTestId("settlement-pay-submit").click();

    await expect(page.getByTestId("settlement-status")).toContainText(/PAID/i, {
      timeout: 30_000,
    });

    const settlementId = page.url().match(/\/rendiciones\/([^/?#]+)/)?.[1];
    if (settlementId) {
      const pdf = await page.request.get(`/api/rendiciones/${settlementId}/pdf`);
      expect(pdf.status()).toBe(200);
    }
  });
});
