import { test as setup, expect } from "@playwright/test";
import { join } from "node:path";
import { E2E_EMAIL, E2E_PASSWORD } from "./helpers/auth";

const authFile = join(process.cwd(), "e2e", ".auth.json");

setup("autenticar admin demo", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();

  const res = await request.post("/api/auth/login", {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();

  const body = (await res.json()) as { ok?: boolean; error?: string };
  expect(body.ok, body.error ?? "login falló").toBeTruthy();

  await request.storageState({ path: authFile });
});
