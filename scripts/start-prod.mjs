import { spawnSync, spawn } from "node:child_process";

function run(label, command, args) {
  console.log(`[start:prod] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

function withConnectTimeout(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "15");
    }
    // Railway Postgres suele exigir SSL en conexiones públicas.
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const rawUrl = process.env.DATABASE_URL?.trim() ?? "";
if (!rawUrl) {
  console.error(
    "[start:prod] Falta DATABASE_URL en el servicio web.\n" +
      "Railway → servicio ERP → Variables → Add Variable → Add Reference → Postgres.DATABASE_URL",
  );
} else {
  process.env.DATABASE_URL = withConnectTimeout(rawUrl);
  try {
    console.log(`[start:prod] DATABASE_URL host=${new URL(process.env.DATABASE_URL).hostname}`);
  } catch {
    console.error("[start:prod] DATABASE_URL inválida");
  }

  const pushCode = run("db push", "npx", ["prisma", "db", "push", "--skip-generate"]);
  if (pushCode !== 0) {
    console.error(
      "[start:prod] prisma db push falló. Revisá que DATABASE_URL apunte al Postgres de Railway.",
    );
  } else {
    const seedCode = run("seed", "npx", ["tsx", "prisma/seed.ts"]);
    if (seedCode !== 0) {
      console.warn("[start:prod] seed falló; continúo con next start");
    }
  }
}

const port = process.env.PORT || "3000";
console.log(`[start:prod] next start -H 0.0.0.0 -p ${port}`);
const child = spawn(
  "npx",
  ["next", "start", "-H", "0.0.0.0", "-p", String(port)],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
