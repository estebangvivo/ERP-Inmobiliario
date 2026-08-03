"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BRAND_LOGO_SRC, BRAND_NAME } from "@/lib/brand";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error"),
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Credenciales inválidas.");
        setLoading(false);
        return;
      }

      router.push(data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo iniciar sesión. Intentá de nuevo.");
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-xl border-[var(--border)] bg-white shadow-lg">
      <CardHeader className="bg-white pb-2 pt-10 text-center">
        <Image
          src={BRAND_LOGO_SRC}
          alt={BRAND_NAME}
          width={720}
          height={220}
          className="mx-auto h-48 w-auto max-w-[95%] bg-transparent object-contain md:h-56"
          priority
          unoptimized
        />
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            ¿No tenés cuenta?{" "}
            <Link href="/sign-up" className="text-[var(--primary)] underline">
              Registrate
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
