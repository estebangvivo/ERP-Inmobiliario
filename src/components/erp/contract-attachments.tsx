"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  CONTRACT_ATTACHMENT_KIND_LABELS,
  CONTRACT_ATTACHMENT_KINDS,
  type ContractAttachmentKind,
} from "@/lib/labels";
import {
  deleteContractAttachmentAction,
  uploadContractAttachmentsAction,
} from "@/server/actions/contract-attachments";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export type ContractAttachmentRow = {
  id: string;
  kind: string;
  fileName: string;
  url: string;
  sizeBytes: number | null;
  createdAt: string;
};

export type AttachmentDraftRow = {
  key: number;
  kind: ContractAttachmentKind;
  files: File[];
};

export function appendAttachmentDrafts(
  formData: FormData,
  rows: AttachmentDraftRow[],
) {
  for (const row of rows) {
    for (const file of row.files) {
      formData.append("attachments", file);
      formData.append("attachmentKinds", row.kind);
    }
  }
}

/** Campos de adjuntos para el alta de contrato. */
export function ContractCreateAttachmentsFields({
  rows,
  onChange,
}: {
  rows: AttachmentDraftRow[];
  onChange: (rows: AttachmentDraftRow[]) => void;
}) {
  return (
    <div className="sm:col-span-2 space-y-3 rounded-lg border border-[var(--border)] p-4">
      <div>
        <p className="text-sm font-medium">Adjuntos del contrato</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Contrato escrito, DNI, recibos de sueldo u otros (PDF, imagen o Word,
          máx. 10MB c/u).
        </p>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
        >
          <div className="space-y-1">
            <Label htmlFor={`attach-kind-${row.key}`}>Tipo</Label>
            <Select
              id={`attach-kind-${row.key}`}
              value={row.kind}
              onChange={(e) => {
                const kind = e.target.value as ContractAttachmentKind;
                onChange(
                  rows.map((r) => (r.key === row.key ? { ...r, kind } : r)),
                );
              }}
            >
              {CONTRACT_ATTACHMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONTRACT_ATTACHMENT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`attach-files-${row.key}`}>Archivos</Label>
            <input
              id={`attach-files-${row.key}`}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,application/pdf,image/*"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--muted)] file:px-3 file:py-1.5"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                onChange(
                  rows.map((r) => (r.key === row.key ? { ...r, files } : r)),
                );
              }}
            />
            {row.files.length > 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                {row.files.map((f) => f.name).join(", ")}
              </p>
            ) : null}
          </div>
          <div className="flex items-end">
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange(rows.filter((r) => r.key !== row.key))
                }
              >
                Quitar
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const key = rows.reduce((m, r) => Math.max(m, r.key), 0) + 1;
          onChange([...rows, { key, kind: "OTHER", files: [] }]);
        }}
      >
        Agregar otro tipo de archivo
      </Button>
    </div>
  );
}

export function ContractAttachmentsManager({
  contractId,
  attachments,
}: {
  contractId: string;
  attachments: ContractAttachmentRow[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    uploadContractAttachmentsAction,
    initial,
  );
  const [kind, setKind] = useState<ContractAttachmentKind>("CONTRACT_DOC");
  const [fileCount, setFileCount] = useState(0);
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div>
        <h3 className="text-base font-semibold">Archivos del contrato</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Podés sumar o sacar archivos en cualquier momento: contrato escrito,
          DNI, recibos de sueldo u otros (PDF, imagen o Word, máx. 10MB).
        </p>
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Sin adjuntos.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] text-sm">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {a.fileName}
                </a>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {CONTRACT_ATTACHMENT_KIND_LABELS[
                    a.kind as ContractAttachmentKind
                  ] ?? a.kind}
                  {a.sizeBytes != null
                    ? ` · ${(a.sizeBytes / 1024).toFixed(0)} KB`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => {
                  startDelete(async () => {
                    await deleteContractAttachmentAction(a.id);
                    router.refresh();
                  });
                }}
              >
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="contractId" value={contractId} />
        {Array.from({ length: fileCount }).map((_, i) => (
          <input key={i} type="hidden" name="attachmentKinds" value={kind} />
        ))}
        <div className="space-y-1">
          <Label htmlFor="upload-kind">Tipo</Label>
          <Select
            id="upload-kind"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as ContractAttachmentKind)
            }
          >
            {CONTRACT_ATTACHMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {CONTRACT_ATTACHMENT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="upload-files">Archivos</Label>
          <input
            id="upload-files"
            name="attachments"
            type="file"
            multiple
            required
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,application/pdf,image/*"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--muted)] file:px-3 file:py-1.5"
            onChange={(e) => setFileCount(e.target.files?.length ?? 0)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Subiendo…" : "Adjuntar archivos"}
          </Button>
          {state && !state.ok ? (
            <p className="mt-2 text-sm text-red-600">{state.error}</p>
          ) : null}
          {state?.ok ? (
            <p className="mt-2 text-sm text-emerald-700">{state.message}</p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
