"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  ExternalLink,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  WHATSAPP_ROUTING_MODE_LABELS,
  type WhatsAppOrgConfig,
} from "@/features/whatsapp/lib/agent-config";
import { updateWhatsAppOrgSettingsAction } from "@/features/whatsapp/actions/settings-actions";
import type { WhatsAppRoutingMode } from "@prisma/client";

function ConnectionStatus({ org }: { org: WhatsAppOrgConfig }) {
  const steps = [
    { label: "Token de acceso Meta", done: org.hasAccessToken },
    { label: "ID del número", done: Boolean(org.waPhoneNumberId?.trim()) },
    { label: "Token de verificación", done: org.hasVerifyToken },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
          org.configured
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-800 dark:text-amber-400"
        }`}
      >
        {org.configured ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <CircleDashed className="h-3.5 w-3.5" />
        )}
        {org.configured ? "WhatsApp conectado" : "Configuración pendiente"}
      </span>
      {!org.configured ? (
        <span className="text-xs text-[var(--muted-foreground)]">
          {completed} de {steps.length} pasos completos
        </span>
      ) : null}
    </div>
  );
}

function WebhookUrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-2">
      <Label>URL del webhook</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <p className="min-w-0 flex-1 break-all rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs sm:text-sm">
          {url}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <>
              <Check className="mr-1.5 h-4 w-4" /> Copiado
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Pegá esta URL en Meta Developers → WhatsApp → Configuración → Webhook.
        Usá el mismo token de verificación que cargás abajo.
      </p>
    </div>
  );
}

export function WhatsAppOrgSettingsForm({ org }: { org: WhatsAppOrgConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState(
    org.waPhoneNumberId ?? "",
  );
  const [waDisplayPhone, setWaDisplayPhone] = useState(
    org.waDisplayPhone ?? "",
  );
  const [routingMode, setRoutingMode] = useState<WhatsAppRoutingMode>(
    org.routingMode,
  );

  function save() {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await updateWhatsAppOrgSettingsAction({
        accessToken: accessToken.trim() || undefined,
        verifyToken: verifyToken.trim() || undefined,
        waPhoneNumberId: waPhoneNumberId.trim() || null,
        waDisplayPhone: waDisplayPhone.trim() || null,
        routingMode,
      });
      if (!result.ok) {
        setError(result.error ?? "Error al guardar.");
        return;
      }
      setAccessToken("");
      setVerifyToken("");
      setSaved(result.message ?? "Guardado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Conexión con Meta</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Vinculá tu cuenta de WhatsApp Business Cloud API. Los datos se
                guardan de forma segura para esta inmobiliaria.
              </CardDescription>
            </div>
            <ConnectionStatus org={org} />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <ol className="grid gap-3 text-sm sm:grid-cols-3">
            {[
              "Entrá a developers.facebook.com con tu cuenta de Meta Business.",
              "En WhatsApp → Configuración de la API, copiá el token y el Phone Number ID.",
              "Pegá la URL del webhook abajo y verificá con tu token de verificación.",
            ].map((step, i) => (
              <li
                key={step}
                className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2.5"
              >
                <span className="font-medium text-[var(--foreground)]">
                  {i + 1}.{" "}
                </span>
                {step}
                {i === 0 ? (
                  <a
                    href="https://developers.facebook.com/apps/"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                  >
                    Abrir Meta Developers
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ol>

          <WebhookUrlField url={org.webhookUrl} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="accessToken">Token de acceso (Meta)</Label>
              <Input
                id="accessToken"
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={
                  org.hasAccessToken
                    ? "•••••••••••• (dejá vacío para mantener el actual)"
                    : "Pegá el token permanente de la API"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="waPhoneNumberId">Phone Number ID</Label>
              <Input
                id="waPhoneNumberId"
                value={waPhoneNumberId}
                onChange={(e) => setWaPhoneNumberId(e.target.value)}
                placeholder="Ej. 123456789012345"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Lo encontrás en la configuración del número en Meta.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verifyToken">Token de verificación</Label>
              <Input
                id="verifyToken"
                type="password"
                autoComplete="off"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder={
                  org.hasVerifyToken
                    ? "•••••••• (dejá vacío para mantener el actual)"
                    : "Elegí una clave y usala también en Meta"
                }
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Debe coincidir con el token que cargás en el webhook de Meta.
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="waDisplayPhone">Teléfono visible (opcional)</Label>
              <Input
                id="waDisplayPhone"
                value={waDisplayPhone}
                onChange={(e) => setWaDisplayPhone(e.target.value)}
                placeholder="+54 9 11 1234-5678"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Solo referencia interna para el equipo.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2.5 text-xs text-[var(--muted-foreground)]">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Los tokens no se muestran completos después de guardarlos. Solo
              un administrador puede actualizarlos desde esta pantalla.
            </p>
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          {saved ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {saved}
            </p>
          ) : null}

          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar conexión"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Derivación de chats</CardTitle>
          <CardDescription>
            Definí cómo se asignan las conversaciones a los agentes cuando el
            bot deriva a un humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xl space-y-2">
            <Label htmlFor="routingMode">Modo de asignación</Label>
            <Select
              id="routingMode"
              value={routingMode}
              onChange={(e) =>
                setRoutingMode(e.target.value as WhatsAppRoutingMode)
              }
            >
              {(
                Object.entries(WHATSAPP_ROUTING_MODE_LABELS) as Array<
                  [WhatsAppRoutingMode, string]
                >
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-[var(--muted-foreground)]">
              En modo manual los agentes toman chats desde la bandeja. Los
              modos automáticos respetan horarios y agentes habilitados.
            </p>
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          {saved ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {saved}
            </p>
          ) : null}

          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar configuración"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
