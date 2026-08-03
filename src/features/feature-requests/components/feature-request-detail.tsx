"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Reply } from "lucide-react";
import type { FeatureRequestStatus } from "@prisma/client";
import {
  acceptFeatureRequestQuote,
  addFeatureRequestStaffMessage,
  addFeatureRequestUserMessage,
  quoteFeatureRequest,
  rejectFeatureRequestQuote,
  updateFeatureRequestStatus,
} from "@/features/feature-requests/actions/feature-request-actions";
import {
  FEATURE_REQUEST_STATUS_LABEL,
  FEATURE_REQUEST_STATUS_OPTIONS,
} from "@/features/feature-requests/lib/labels";
import { FeatureRequestMediaGallery } from "@/features/feature-requests/components/feature-request-media-gallery";
import { cn } from "@/lib/utils";
import { formatDateTimeAR } from "@/lib/format-date";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2";

const fileInputClass =
  "block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-foreground";

export type FeatureRequestDetailView = {
  id: string;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  attachmentUrls: string[];
  quoteAmount: number | null;
  quoteCurrency: string | null;
  quoteNotes: string | null;
  quotedAt: string | null;
  createdAt: string;
  updatedAt: string;
  organizationName: string;
  createdByName: string;
  createdByEmail: string;
  isOwner: boolean;
  isStaffView: boolean;
  messages: {
    id: string;
    body: string;
    authorKind: "USER" | "STAFF";
    attachmentUrls: string[];
    createdAt: string;
    authorName: string;
    authorEmail?: string;
  }[];
};

function formatMailDate(iso: string) {
  return formatDateTimeAR(iso);
}

export function FeatureRequestDetail({
  request,
}: {
  request: FeatureRequestDetailView;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [quoteAmount, setQuoteAmount] = useState(
    request.quoteAmount?.toString() ?? "",
  );
  const [quoteCurrency, setQuoteCurrency] = useState(
    request.quoteCurrency ?? "USD",
  );
  const [quoteNotes, setQuoteNotes] = useState(request.quoteNotes ?? "");
  const [statusNote, setStatusNote] = useState("");
  const [nextStatus, setNextStatus] = useState<FeatureRequestStatus>(
    request.status,
  );

  const closed = ["CLOSED", "REJECTED", "IMPLEMENTED"].includes(
    request.status,
  );
  const canReply = !closed && (request.isOwner || request.isStaffView);
  const staffOnly = request.isStaffView && !request.isOwner;

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    options?: { backToList?: boolean },
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Error");
        return;
      }
      setStatusNote("");
      formRef.current?.reset();
      if (options?.backToList) {
        router.push(
          request.isStaffView && !request.isOwner
            ? "/admin?tab=requests"
            : "/solicitudes",
        );
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Encabezado tipo asunto de correo */}
      <header className="rounded-lg border border-border bg-surface px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 font-display text-2xl tracking-tight sm:text-3xl">
            {request.title}
          </h1>
          <span className="shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium">
            {FEATURE_REQUEST_STATUS_LABEL[request.status]}
          </span>
        </div>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[4.5rem_1fr] sm:gap-x-3">
          <dt className="text-muted-foreground">De</dt>
          <dd className="min-w-0 break-words">
            <span className="font-medium">{request.createdByName}</span>
            <span className="text-muted-foreground">
              {" "}
              &lt;{request.createdByEmail}&gt;
            </span>
          </dd>
          <dt className="text-muted-foreground">Para</dt>
          <dd>Plataforma · soporte</dd>
          <dt className="text-muted-foreground">Empresa</dt>
          <dd className="min-w-0 break-words">{request.organizationName}</dd>
          <dt className="text-muted-foreground">Fecha</dt>
          <dd>{formatMailDate(request.createdAt)}</dd>
        </dl>

        {request.quoteAmount != null && request.quoteCurrency && (
          <div className="mt-4 rounded-md border border-amber-700/25 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-medium">
              Cotización: {request.quoteCurrency}{" "}
              {request.quoteAmount.toLocaleString("es-AR")}
            </p>
            {request.quoteNotes && (
              <p className="mt-1 whitespace-pre-wrap opacity-90">
                {request.quoteNotes}
              </p>
            )}
          </div>
        )}

        {request.isOwner && request.status === "QUOTED" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => acceptFeatureRequestQuote(request.id))}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              Aceptar cotización
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const reason =
                  window.prompt("Motivo del rechazo (opcional)") ?? "";
                run(() => rejectFeatureRequestQuote(request.id, reason));
              }}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
            >
              Rechazar cotización
            </button>
          </div>
        )}
      </header>

      {/* Hilo de mensajes */}
      <section className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="border-b border-border bg-surface/60 px-4 py-2.5 sm:px-5">
          <h2 className="text-sm font-medium text-muted-foreground">
            Conversación · {request.messages.length} mensaje
            {request.messages.length === 1 ? "" : "s"}
          </h2>
        </div>

        <ul className="divide-y divide-border bg-muted/30">
          {request.messages.map((m) => {
            const fromLabel =
              m.authorKind === "STAFF" ? "Plataforma" : m.authorName;
            const fromEmail =
              m.authorKind === "STAFF"
                ? "soporte"
                : m.authorEmail || request.createdByEmail;
            const toLabel =
              m.authorKind === "STAFF"
                ? request.createdByName
                : "Plataforma";

            return (
              <li key={m.id} className="bg-background">
                <div
                  className={cn(
                    "border-b border-l-4 px-4 py-3 sm:px-5",
                    m.authorKind === "STAFF"
                      ? "border-l-accent bg-accent text-accent-foreground"
                      : "border-l-foreground/70 bg-muted text-foreground",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 text-sm">
                      <span
                        className={cn(
                          "mr-1.5 text-xs font-semibold uppercase tracking-wide",
                          m.authorKind === "STAFF"
                            ? "text-accent-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        De
                      </span>
                      <span className="font-semibold">{fromLabel}</span>
                      <span
                        className={cn(
                          m.authorKind === "STAFF"
                            ? "text-accent-foreground/85"
                            : "text-muted-foreground",
                        )}
                      >
                        {" "}
                        &lt;{fromEmail}&gt;
                      </span>
                    </p>
                    <time
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                        m.authorKind === "STAFF"
                          ? "bg-accent-foreground/15 text-accent-foreground"
                          : "bg-background text-muted-foreground",
                      )}
                    >
                      {formatMailDate(m.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1.5 text-sm">
                    <span
                      className={cn(
                        "mr-1.5 text-xs font-semibold uppercase tracking-wide",
                        m.authorKind === "STAFF"
                          ? "text-accent-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      Para
                    </span>
                    <span className="font-medium">{toLabel}</span>
                  </p>
                  {m.authorKind === "USER" && (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Mensaje del solicitante
                    </p>
                  )}
                  {m.authorKind === "STAFF" && (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-accent-foreground/80">
                      Respuesta de la plataforma
                    </p>
                  )}
                </div>

                <div className="px-4 py-4 sm:px-5">
                  {m.body && m.body !== "(Adjunto)" ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {m.body}
                    </p>
                  ) : null}
                  {m.attachmentUrls.length > 0 && (
                    <div
                      className={cn(
                        m.body && m.body !== "(Adjunto)" && "mt-3",
                      )}
                    >
                      <p className="mb-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="size-3.5" aria-hidden />
                        Adjuntos
                      </p>
                      <FeatureRequestMediaGallery
                        urls={m.attachmentUrls}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Adjuntos del pedido si no estánieron en el primer mensaje */}
        {request.attachmentUrls.length > 0 &&
          !request.messages.some(
            (m) => m.attachmentUrls.length > 0,
          ) && (
            <div className="border-t border-border px-4 py-3 sm:px-5">
              <p className="mb-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="size-3.5" aria-hidden />
                Adjuntos de la solicitud
              </p>
              <FeatureRequestMediaGallery urls={request.attachmentUrls} />
            </div>
          )}

        {canReply && (
          <div className="border-t border-border bg-surface/40 px-4 py-4 sm:px-5">
            <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium">
              <Reply className="size-4" aria-hidden />
              {staffOnly ? "Responder al solicitante" : "Responder"}
            </p>
            <form
              ref={formRef}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                formData.set("requestId", request.id);
                if (staffOnly) formData.set("awaitUser", "1");
                run(() =>
                  staffOnly
                    ? addFeatureRequestStaffMessage(formData)
                    : addFeatureRequestUserMessage(formData),
                );
              }}
            >
              <textarea
                name="body"
                className={`${fieldClass} min-h-28`}
                maxLength={5000}
                placeholder="Escribí tu respuesta…"
              />
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">
                  Adjuntar imágenes o videos
                </span>
                <input
                  type="file"
                  name="media"
                  accept="image/*,video/*"
                  multiple
                  className={fileInputClass}
                />
              </label>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
                >
                  {pending ? "Enviando…" : "Enviar respuesta"}
                </button>
              </div>
            </form>
          </div>
        )}

        {!canReply && error && (
          <p className="border-t border-border px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      {request.isStaffView && (
        <div className="space-y-6 rounded-lg border border-border bg-surface/30 p-4 sm:p-5">
          <section className="max-w-md space-y-3">
            <h2 className="font-display text-lg tracking-tight">Cotizar</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Monto</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Moneda</span>
                <select
                  value={quoteCurrency}
                  onChange={(e) => setQuoteCurrency(e.target.value)}
                  className={fieldClass}
                >
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Notas de cotización
              </span>
              <textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                className={`${fieldClass} min-h-20`}
                maxLength={2000}
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  quoteFeatureRequest(request.id, {
                    amount: Number(quoteAmount),
                    currency: quoteCurrency,
                    notes: quoteNotes,
                  }),
                )
              }
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              Enviar cotización
            </button>
          </section>

          <section className="max-w-md space-y-3">
            <h2 className="font-display text-lg tracking-tight">
              Cambiar estado
            </h2>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Estado</span>
              <select
                value={nextStatus}
                onChange={(e) =>
                  setNextStatus(e.target.value as FeatureRequestStatus)
                }
                className={fieldClass}
              >
                {FEATURE_REQUEST_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {FEATURE_REQUEST_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Nota opcional
              </span>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                className={`${fieldClass} min-h-16`}
                maxLength={2000}
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    updateFeatureRequestStatus(
                      request.id,
                      nextStatus,
                      statusNote || undefined,
                    ),
                  { backToList: true },
                )
              }
              className="rounded-md border border-border bg-background px-4 py-2 text-sm disabled:opacity-60"
            >
              Actualizar estado
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
