import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export type StoragePutInput = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  folder?: string;
};

export type StoragePutResult = {
  url: string;
  key: string;
};

export interface StorageService {
  put(input: StoragePutInput): Promise<StoragePutResult>;
  delete(key: string): Promise<void>;
}

function sanitizeFilename(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

export class LocalStorageService implements StorageService {
  private root = path.join(process.cwd(), "public", "uploads");

  async put(input: StoragePutInput): Promise<StoragePutResult> {
    const folder = input.folder?.replace(/^\/+|\/+$/g, "") || "properties";
    const safeName = sanitizeFilename(input.filename) || "image.bin";
    const key = `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
    const absolute = path.join(this.root, key);

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.buffer);

    return {
      key,
      url: `/uploads/${key.replace(/\\/g, "/")}`,
    };
  }

  async delete(key: string): Promise<void> {
    const safeKey = key.replace(/^\/+/, "").replace(/^uploads\//, "");
    const absolute = path.join(this.root, safeKey);
    if (!absolute.startsWith(this.root)) return;
    try {
      await unlink(absolute);
    } catch {
      // ignore missing files
    }
  }
}

export const storage: StorageService = new LocalStorageService();
