"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";

type PrintReportToolbarProps = {
  backHref: string;
  backLabel: string;
  pdfUrl: string;
  filename: string;
  /** Si true, abre el diálogo de impresión al cargar. */
  autoPrint?: boolean;
};

function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return (
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1
  );
}

function canShareFiles(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare === "function") {
    try {
      const probe = new File([new Uint8Array([37, 80, 68, 70])], "t.pdf", {
        type: "application/pdf",
      });
      return navigator.canShare({ files: [probe] });
    } catch {
      return true;
    }
  }
  return true;
}

async function fetchPdfFile(pdfUrl: string, filename: string): Promise<File> {
  const res = await fetch(pdfUrl, { credentials: "same-origin" });
  if (!res.ok) throw new Error("No se pudo generar el PDF.");
  const blob = await res.blob();
  return new File([blob], filename, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

function triggerAnchorDownload(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sharePdfInUserGesture(
  file: File,
  title: string,
): Promise<"ok" | "abort" | "fail"> {
  if (typeof navigator.share !== "function") {
    return Promise.resolve("fail");
  }
  return navigator
    .share({ files: [file], title })
    .then(() => "ok" as const)
    .catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "abort" as const;
      }
      return navigator
        .share({ files: [file] })
        .then(() => "ok" as const)
        .catch((e2: unknown) => {
          if (e2 instanceof DOMException && e2.name === "AbortError") {
            return "abort" as const;
          }
          return "fail" as const;
        });
    });
}

export function PrintReportToolbar({
  backHref,
  backLabel,
  pdfUrl,
  filename,
  autoPrint = false,
}: PrintReportToolbarProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const fileRef = useRef<File | null>(null);
  const autoPrintDone = useRef(false);

  useEffect(() => {
    if (!autoPrint || autoPrintDone.current) return;
    autoPrintDone.current = true;
    const id = window.setTimeout(() => {
      window.print();
      const url = new URL(window.location.href);
      if (url.searchParams.has("autoPrint")) {
        url.searchParams.delete("autoPrint");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [autoPrint]);

  useEffect(() => {
    let cancelled = false;
    setPdfReady(false);
    fileRef.current = null;
    void (async () => {
      try {
        const file = await fetchPdfFile(pdfUrl, filename);
        if (cancelled) return;
        fileRef.current = file;
        setPdfReady(true);
      } catch {
        if (!cancelled) {
          setError("No se pudo preparar el PDF. Probá recargar la página.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, filename]);

  async function ensureFile(): Promise<File> {
    if (fileRef.current) return fileRef.current;
    const file = await fetchPdfFile(pdfUrl, filename);
    fileRef.current = file;
    setPdfReady(true);
    return file;
  }

  async function onDownloadPdf() {
    setError(null);
    setSuccess(null);
    setDownloading(true);
    try {
      const file = await ensureFile();

      if (isAppleTouchDevice()) {
        const result = await sharePdfInUserGesture(file, filename);
        if (result === "ok" || result === "abort") {
          if (result === "ok") {
            setSuccess(
              "En el menú elegí «Guardar en Archivos» para guardar el PDF.",
            );
          }
          return;
        }
        const url = URL.createObjectURL(file);
        window.open(url, "_blank", "noopener,noreferrer");
        setSuccess(
          "Se abrió el PDF. Tocá compartir del visor y «Guardar en Archivos».",
        );
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
        return;
      }

      triggerAnchorDownload(file);
      setSuccess("PDF descargado. Buscalo en Descargas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar el PDF.");
    } finally {
      setDownloading(false);
    }
  }

  const busy = downloading;

  const feedback = (
    <>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-success" role="status">
          {success}
        </p>
      ) : null}
    </>
  );

  const actions = (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => window.print()}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-surface disabled:opacity-60 sm:flex-none"
      >
        <Printer className="size-4" aria-hidden />
        Imprimir
      </button>
      <button
        type="button"
        disabled={busy || !pdfReady}
        onClick={() => void onDownloadPdf()}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2.5 text-sm font-medium text-background disabled:opacity-60 sm:flex-none"
      >
        <Download className="size-4" aria-hidden />
        {downloading ? "Descargando…" : "Descargar PDF"}
      </button>
    </>
  );

  return (
    <>
      <div className="print:hidden sticky top-0 z-20 border-b border-border bg-surface-elevated/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {backLabel}
            </Link>
            <div className="hidden flex-wrap gap-2 sm:flex">{actions}</div>
          </div>
          <div className="hidden sm:block">{feedback}</div>
          {!pdfReady && !error ? (
            <p className="hidden text-xs text-muted-foreground sm:block">
              Preparando PDF…
            </p>
          ) : null}
        </div>
      </div>

      <div className="print:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-elevated p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <div className="mb-2 space-y-1">{feedback}</div>
        <div className="flex gap-2">{actions}</div>
      </div>
    </>
  );
}
