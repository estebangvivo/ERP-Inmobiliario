"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAdminMercadoPagoConfig } from "@/features/billing/actions/admin-mercadopago-actions";
import type { MercadoPagoConfigPublic } from "@/features/billing/lib/platform-billing-settings";

const fieldClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]";

type AdminMercadoPagoPanelProps = {
  config: MercadoPagoConfigPublic;
};

export function AdminMercadoPagoPanel({ config }: AdminMercadoPagoPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accessToken, setAccessToken] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [surchargePercent, setSurchargePercent] = useState(
    String(config.surchargePercent ?? 4),
  );
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [copied, setCopied] = useState(false);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const pct = Number(surchargePercent.replace(",", "."));
    startTransition(async () => {
      const result = await saveAdminMercadoPagoConfig({
        accessToken: accessToken || undefined,
        publicKey: publicKey || undefined,
        surchargePercent: pct,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAccessToken("");
      setPublicKey("");
      setOk(true);
      router.refresh();
    });
  }

  function onClear() {
    if (!window.confirm("¿Quitar el Access Token guardado en la base?")) return;
    setError(null);
    setOk(false);
    startTransition(async () => {
      const result = await saveAdminMercadoPagoConfig({ clearToken: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(config.webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar la URL.");
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CreditCard className="size-5" aria-hidden />
          Mercado Pago
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Access Token de tu aplicación en{" "}
          <a
            href="https://www.mercadopago.com.ar/developers/panel/app"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--primary)] underline underline-offset-2"
          >
            Developers → Tus integraciones
          </a>
          . Con esto entran los pagos de planes SaaS.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm">
        <p>
          <span className="text-[var(--muted-foreground)]">Estado:</span>{" "}
          {config.configured ? (
            <span className="font-medium text-emerald-700">Configurado</span>
          ) : (
            <span className="font-medium text-amber-800">Sin configurar</span>
          )}
          {config.fromEnv ? " (desde variable de entorno)" : null}
        </p>
        {config.tokenHint && (
          <p>
            <span className="text-[var(--muted-foreground)]">Token:</span>{" "}
            <code className="text-xs">{config.tokenHint}</code>
          </p>
        )}
        <div className="pt-1">
          <p className="mb-1 text-[var(--muted-foreground)]">
            URL de notificaciones (webhook) — pegala en el panel de MP:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="block max-w-full truncate rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs">
              {config.webhookUrl}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copyWebhook}>
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      </div>

      <form
        onSubmit={onSave}
        className="space-y-4 rounded-lg border border-[var(--border)] p-4"
      >
        <div className="space-y-1.5">
          <Label>Access Token</Label>
          <Input
            type="password"
            autoComplete="off"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            className={fieldClass}
            placeholder={
              config.configured
                ? "Dejá vacío para mantener el actual"
                : "APP_USR-… o TEST-…"
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Public Key{" "}
            <span className="font-normal text-[var(--muted-foreground)]">
              (opcional)
            </span>
          </Label>
          <Input
            type="text"
            autoComplete="off"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            className={fieldClass}
            placeholder={
              config.publicKeyHint
                ? "Dejá vacío para mantener la actual"
                : "APP_USR-… (pública)"
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Recargo Mercado Pago (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step="0.1"
            required
            value={surchargePercent}
            onChange={(e) => setSurchargePercent(e.target.value)}
            className={fieldClass}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Se suma al precio del plan solo si eligen Mercado Pago (ej. 4 =
            +4%). Transferencia bancaria no tiene este recargo.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--muted)] px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </p>
        )}
        {ok && (
          <p className="rounded-md border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Guardado.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {config.configured && !config.fromEnv && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClear}
            >
              Quitar token de la base
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
