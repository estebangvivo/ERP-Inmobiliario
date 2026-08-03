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

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
if (!databaseUrl) {
  console.error(
    "[start:prod] Falta DATABASE_URL. En Railway vinculá Postgres al servicio web (Variable Reference).",
  );
  process.exit(1);
}

try {
  const host = new URL(databaseUrl).hostname;
  console.log(`[start:prod] DATABASE_URL host=${host}`);
} catch {
  console.error("[start:prod] DATABASE_URL no es una URL válida.");
  process.exit(1);
}

const pushCode = run("db push", "npx", ["prisma", "db", "push"]);
if (pushCode !== 0) {
  console.error("[start:prod] prisma db push falló.");
  process.exit(pushCode);
}

const seedCode = run("seed", "npx", ["tsx", "prisma/seed.ts"]);
if (seedCode !== 0) {
  console.warn("[start:prod] seed falló; la app arranca igual.");
}

const port = process.env.PORT || "3000";
console.log(`[start:prod] next start -H 0.0.0.0 -p ${port}`);
const child = spawn(
  "npx",
  ["next", "start", "-H", "0.0.0.0", "-p", port],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
