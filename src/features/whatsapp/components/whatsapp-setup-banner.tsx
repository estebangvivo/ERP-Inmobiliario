"use client";

import Link from "next/link";
import { MessageCircle, Settings2 } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function WhatsAppSetupBanner({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card className="overflow-hidden border-[var(--primary)]/20 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/40">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <CardHeader className="p-0">
              <CardTitle className="text-lg">
                Conectá WhatsApp para empezar
              </CardTitle>
              <CardDescription className="mt-1 max-w-xl">
                Vinculá tu número de Meta Business y el bot va a atender
                consultas, identificar clientes y derivar chats a tus agentes.
              </CardDescription>
            </CardHeader>
          </div>
        </div>
        {isAdmin ? (
          <Link
            href="/whatsapp/configuracion"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            <Settings2 className="mr-2 h-4 w-4" />
            Configurar ahora
          </Link>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            Pedile a un administrador que complete la configuración.
          </p>
        )}
      </div>
    </Card>
  );
}
