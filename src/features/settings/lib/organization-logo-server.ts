import { readFile } from "node:fs/promises";
import path from "node:path";

export type OrganizationLogoBytes = {
  bytes: Uint8Array;
  format: "png" | "jpg";
};

export async function loadOrganizationLogoBytes(
  logoUrl: string | null | undefined,
): Promise<OrganizationLogoBytes | null> {
  if (!logoUrl) return null;

  if (logoUrl.startsWith("data:")) {
    const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(
      logoUrl.split("?")[0] ?? logoUrl,
    );
    if (!match) return null;
    const mime = match[1].toLowerCase();
    const format: "png" | "jpg" = mime === "image/png" ? "png" : "jpg";
    try {
      const bytes = new Uint8Array(Buffer.from(match[2], "base64"));
      return { bytes, format };
    } catch {
      return null;
    }
  }

  const pathname = logoUrl.split("?")[0] ?? "";
  if (!pathname.startsWith("/uploads/")) return null;

  const ext = path.extname(pathname).toLowerCase();
  const format =
    ext === ".png" ? "png" : ext === ".jpg" || ext === ".jpeg" ? "jpg" : null;
  if (!format) return null;

  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      pathname.replace(/^\//, ""),
    );
    const bytes = new Uint8Array(await readFile(filePath));
    return { bytes, format };
  } catch {
    return null;
  }
}
