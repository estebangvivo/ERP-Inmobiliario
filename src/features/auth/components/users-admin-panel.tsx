"use client";

import { useState, useTransition } from "react";
import type { OrganizationRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/erp/page-chrome";
import { ORG_MODULE_KEYS, APP_MODULES } from "@/features/auth/lib/modules";
import { ROLE_LABELS } from "@/lib/labels";
import {
  createOrganizationUser,
  updateOrganizationUser,
  removeOrganizationUser,
  type OrganizationUserRow,
} from "@/features/auth/actions/user-actions";

type Props = {
  users: OrganizationUserRow[];
  organizationId?: string;
};

const ASSIGNABLE_ROLES: OrganizationRole[] = [
  "ADMIN",
  "AGENT",
  "OWNER",
  "TENANT",
  "GUARANTOR",
  "SUPPLIER",
  "VIEWER",
];

const MODULE_LABELS = Object.fromEntries(
  APP_MODULES.map((m) => [m.key, m.label]),
) as Record<string, string>;

export function UsersAdminPanel({ users, organizationId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OrganizationUserRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setError(null);
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const modules = ORG_MODULE_KEYS.filter(
      (k) => fd.get(`mod_${k}`) === "on",
    );

    startTransition(async () => {
      const result = await createOrganizationUser({
        organizationId,
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        role: String(fd.get("role") ?? "AGENT") as OrganizationRole,
        allowedModules: modules,
        phone: String(fd.get("phone") ?? "") || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeForm();
      window.location.reload();
    });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const modules = ORG_MODULE_KEYS.filter(
      (k) => fd.get(`mod_${k}`) === "on",
    );

    startTransition(async () => {
      const result = await updateOrganizationUser({
        organizationId,
        userId: editing.userId,
        name: String(fd.get("name") ?? ""),
        role: String(fd.get("role") ?? editing.role) as OrganizationRole,
        allowedModules: modules,
        isActive: fd.get("isActive") === "on",
        password: String(fd.get("password") ?? "") || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeForm();
      window.location.reload();
    });
  }

  function handleRemove(userId: string) {
    if (!confirm("¿Quitar este usuario de la empresa?")) return;
    startTransition(async () => {
      const result = await removeOrganizationUser({
        organizationId,
        userId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
            setError(null);
          }}
        >
          Nuevo usuario
        </Button>
      </div>

      {(showForm || editing) && (
        <form
          onSubmit={editing ? handleUpdate : handleCreate}
          className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <h3 className="font-semibold">
            {editing ? "Editar usuario" : "Alta de usuario"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" name="name" defaultValue={editing?.name} required />
            <Field
              label="Email"
              name="email"
              type="email"
              defaultValue={editing?.email}
              required={!editing}
              disabled={!!editing}
            />
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <Select
                id="role"
                name="role"
                defaultValue={editing?.role ?? "AGENT"}
                required
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </div>
            <Field
              label={editing ? "Nueva contraseña (opcional)" : "Contraseña"}
              name="password"
              type="password"
              required={!editing}
            />
          </div>

          <div className="space-y-2">
            <Label>Módulos permitidos</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {ORG_MODULE_KEYS.filter((k) => k !== "home").map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`mod_${key}`}
                    defaultChecked={
                      editing
                        ? editing.allowedModules.includes(key)
                        : key !== "usuarios" && key !== "ajustes"
                    }
                    className="h-4 w-4"
                  />
                  {MODULE_LABELS[key] ?? key}
                </label>
              ))}
            </div>
          </div>

          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing.isActive}
                className="h-4 w-4"
              />
              Usuario activo
            </label>
          )}

          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <DataTable
        headers={["Nombre", "Email", "Rol", "Módulos", "Estado", ""]}
        empty={users.length === 0}
      >
        {users.map((user) => (
          <tr key={user.membershipId} className="hover:bg-[var(--muted)]/40">
            <td className="px-4 py-3 font-medium">{user.name}</td>
            <td className="px-4 py-3 text-[var(--muted-foreground)]">
              {user.email}
            </td>
            <td className="px-4 py-3">
              <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            </td>
            <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
              {user.role === "ADMIN"
                ? "Todos"
                : user.allowedModules.length > 0
                  ? user.allowedModules.join(", ")
                  : "Por defecto"}
            </td>
            <td className="px-4 py-3">
              <Badge variant={user.isActive ? "success" : "danger"}>
                {user.isActive ? "Activo" : "Inactivo"}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(user);
                    setShowForm(false);
                    setError(null);
                  }}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRemove(user.userId)}
                  disabled={pending}
                >
                  Quitar
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}
