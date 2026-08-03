"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { registerWithPassword } from "@/features/auth/actions/register-actions";

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await registerWithPassword({ name, email, password });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push("/onboarding/planes");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md border-[var(--border)] shadow-lg">
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Registrate para probar el ERP inmobiliario.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Mínimo 8 caracteres, una mayúscula y un número.
            </p>
          </div>
          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creando…" : "Registrarme"}
          </Button>
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-[var(--primary)] underline">
              Ingresar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
