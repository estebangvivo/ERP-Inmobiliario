import { test, expect } from "@playwright/test";
import { loadFixtures, type E2EFixtures } from "../helpers/fixtures";

test.describe.configure({ mode: "serial", order: "first" });

function parseMoney(text: string): number {
  const digits = text.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(digits) || 0;
}

test.describe("Flujos transversales", () => {
  let fixtures: E2EFixtures;
  let receiptNumber: string | null = null;
  let receiptId: string | null = null;
  let cashAfterCollection = 0;

  test.beforeAll(() => {
    fixtures = loadFixtures();
  });

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
    await expect(page.getByTestId("payment-success")).toContainText(
      /Recibo\s+[\w-]+\s+generado/i,
    );

    const text = (await page.getByTestId("payment-success").textContent()) ?? "";
    const match = text.match(/Recibo\s+([\w-]+)\s+generado/i);
    expect(match).toBeTruthy();
    receiptNumber = match![1]!;

    await expect(page.getByTestId("bill-status")).toContainText(/Pagada/i);

    const printLink = page.getByRole("link", {
      name: /Abrir recibo para imprimir/i,
    });
    const href = await printLink.getAttribute("href");
    receiptId = href?.match(/\/tesoreria\/recibos\/([^/]+)/)?.[1] ?? null;

    await page.goto("/tesoreria/caja");
    const balanceText = await page.getByTestId("daily-cash-balance").textContent();
    cashAfterCollection = parseMoney(balanceText ?? "0");
    expect(cashAfterCollection).toBeGreaterThanOrEqual(fixtures.billTotalAmount - 1);
  });

  test("recibo en tesorería con PDF y monto", async ({ page }) => {
    test.skip(!receiptNumber || !receiptId, "Depende del cobro anterior");

    await page.goto(`/tesoreria/recibos/${receiptId}`);
    await expect(page.locator("body")).toContainText(receiptNumber!);

    const pdf = await page.request.get(`/api/tesoreria/recibos/${receiptId}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
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
    await expect(ownerRow).not.toContainText("$ 0,00");

    await ownerRow.getByRole("link", { name: "Ver" }).click();
    await expect(page).toHaveURL(/\/rendiciones\/[^/]+/);
    const settlementUrl = page.url();
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

    await page.goto("/tesoreria/caja");
    const cashBeforePay = parseMoney(
      (await page.getByTestId("daily-cash-balance").textContent()) ?? "0",
    );
    expect(cashBeforePay).toBeGreaterThan(0);

    await page.goto(settlementUrl);
    await page.locator("#method").selectOption("CASH");
    await page.getByTestId("settlement-pay-submit").click();

    await expect(page.getByTestId("settlement-status")).toContainText(/PAID/i, {
      timeout: 30_000,
    });

    await page.goto("/tesoreria/caja");
    const cashAfterPay = parseMoney(
      (await page.getByTestId("daily-cash-balance").textContent()) ?? "0",
    );
    expect(cashAfterPay).toBeLessThan(cashBeforePay);

    const settlementId = settlementUrl.match(/\/rendiciones\/([^/?#]+)/)?.[1];
    if (settlementId) {
      const pdf = await page.request.get(`/api/rendiciones/${settlementId}/pdf`);
      expect(pdf.status()).toBe(200);
    }
  });
});
