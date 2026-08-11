"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { storage } from "@/lib/storage";
import {
  CONTRACT_ATTACHMENT_KINDS,
  type ContractAttachmentKind,
} from "@/lib/labels";
import type { ActionResult } from "@/server/actions/users";

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 20;

function normalizeKind(raw: string): ContractAttachmentKind {
  if (
    (CONTRACT_ATTACHMENT_KINDS as readonly string[]).includes(raw)
  ) {
    return raw as ContractAttachmentKind;
  }
  return "OTHER";
}

export async function saveContractAttachments(
  contractId: string,
  files: File[],
  kinds: string[],
): Promise<{ saved: number; error?: string }> {
  if (files.length === 0) return { saved: 0 };
  if (files.length > MAX_FILES) {
    return { saved: 0, error: `Máximo ${MAX_FILES} archivos por carga` };
  }

  let saved = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || file.size === 0) continue;
    if (file.size > MAX_BYTES) {
      return { saved, error: `${file.name} supera 10MB` };
    }
    const type = file.type || "application/octet-stream";
    if (file.type && !ALLOWED.has(file.type)) {
      return {
        saved,
        error: `Formato no permitido: ${file.name}. Usá PDF, imagen o Word.`,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storage.put({
      buffer,
      filename: file.name,
      contentType: type,
      folder: `contracts/${contractId}`,
    });

    await prisma.contractAttachment.create({
      data: {
        contractId,
        kind: normalizeKind(kinds[i] ?? "OTHER"),
        fileName: file.name,
        url: stored.url,
        mimeType: type,
        sizeBytes: file.size,
      },
    });
    saved += 1;
  }

  return { saved };
}

export async function uploadContractAttachmentsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const contractId = String(formData.get("contractId") ?? "");
  if (!contractId) return { ok: false, error: "Contrato requerido" };

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!contract) return { ok: false, error: "Contrato no encontrado" };

  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const kinds = formData.getAll("attachmentKinds").map(String);

  if (files.length === 0) {
    return { ok: false, error: "Seleccioná al menos un archivo" };
  }

  const result = await saveContractAttachments(contractId, files, kinds);
  if (result.error && result.saved === 0) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/contratos/${contractId}`);
  revalidatePath("/contratos");
  return {
    ok: true,
    message: result.error
      ? `${result.saved} archivo(s) subido(s). ${result.error}`
      : `${result.saved} archivo(s) adjunto(s)`,
  };
}

export async function deleteContractAttachmentAction(
  attachmentId: string,
): Promise<ActionResult> {
  const session = await requireStaff();
  const attachment = await prisma.contractAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      contract: { select: { id: true, organizationId: true } },
    },
  });
  if (!attachment || attachment.contract.organizationId !== session.organizationId) {
    return { ok: false, error: "Adjunto no encontrado" };
  }

  const key = attachment.url.replace(/^\/uploads\//, "");
  await storage.delete(key);
  await prisma.contractAttachment.delete({ where: { id: attachmentId } });

  revalidatePath(`/contratos/${attachment.contractId}`);
  revalidatePath("/contratos");
  return { ok: true, message: "Adjunto eliminado" };
}
