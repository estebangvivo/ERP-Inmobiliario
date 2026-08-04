"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { registerWithPassword } from "@/features/auth/actions/register-actions";
import {
  PASSWORD_RULES_HINT,
  validatePasswordStrength,
} from "@/features/auth/lib/password";
import { BRAND_NAME, BRAND_SLOGAN } from "@/lib/brand";

const fieldClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirmPassword = String(fd.get("confirmPassword") ?? "");
    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
      setError(strength.error);
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    startTransition(async () => {
      const result = await registerWithPassword({
        email: String(fd.get("email") ?? ""),
        password,
        confirmPassword,
        phone: String(fd.get("phone") ?? ""),
        firstName: String(fd.get("firstName") ?? "") || undefined,
        lastName: String(fd.get("lastName") ?? "") || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/onboarding/planes");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-md space-y-5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg sm:p-6">
      <div className="text-center">
        <p className="text-3xl font-semibold tracking-tight">{BRAND_NAME}</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {BRAND_SLOGAN}
        </p>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          Crear cuenta
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Registrate para contratar el sistema y crear tu inmobiliaria.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 text-left">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Nombre</span>
            <input
              name="firstName"
              required
              className={fieldClass.replace(" pr-10", "")}
              autoComplete="given-name"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Apellido</span>
            <input
              name="lastName"
              required
              className={fieldClass.replace(" pr-10", "")}
              autoComplete="family-name"
            />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            type="text"
            name="email"
            inputMode="email"
            required
            autoComplete="email"
            className={fieldClass.replace(" pr-10", "")}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Teléfono celular</span>
          <input
            type="tel"
            name="phone"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="11 5555-5555"
            className={fieldClass.replace(" pr-10", "")}
          />
          <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
            Lo usamos para avisarte por WhatsApp si tu pago fue aceptado o
            rechazado.
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Contraseña</span>
          <span className="relative block">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </span>
          <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
            {PASSWORD_RULES_HINT}
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Confirmar contraseña</span>
          <span className="relative block">
            <input
              type={showConfirm ? "text" : "password"}
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label={
                showConfirm
                  ? "Ocultar confirmación"
                  : "Ver confirmación de contraseña"
              }
            >
              {showConfirm ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </span>
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-[var(--destructive)]/40 bg-red-50 px-3 py-2 text-sm font-medium text-[var(--destructive)]"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-60"
        >
          {pending ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <p className="text-center text-sm text-[var(--muted-foreground)]">
        ¿Ya tenés cuenta?{" "}
        <Link
          href="/login"
          className="text-[var(--primary)] underline-offset-2 hover:underline"
        >
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}
