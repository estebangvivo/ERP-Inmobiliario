"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/erp/page-chrome";
import {
  deleteArea,
  saveArea,
  type AreaRow,
} from "@/features/auth/actions/area-actions";

export function AreasAdminPanel({ areas }: { areas: AreaRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formOpen = showForm || !!editing;

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveArea({
        id: editing?.id,
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
        keywords: String(fd.get("keywords") ?? ""),
        ...(editing ? { isActive: fd.get("isActive") === "on" } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeForm();
      router.refresh();
    });
  }

  function handleDelete(area: AreaRow) {
    if (!confirm(`¿Eliminar el área "${area.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteArea(area.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
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
          Nueva área
        </Button>
      </div>

      {formOpen ? (
        <form
          key={editing?.id ?? "new"}
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <h3 className="font-semibold">
            {editing ? "Editar área" : "Nueva área"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                name="name"
                autoComplete="off"
                defaultValue={editing?.name ?? ""}
                placeholder="Ej. Administración, Cobranzas, Mantenimiento"
                required
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Input
                id="description"
                name="description"
                autoComplete="off"
                defaultValue={editing?.description ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">Palabras clave para el chatbot</Label>
            <Input
              id="keywords"
              name="keywords"
              autoComplete="off"
              defaultValue={editing?.keywords.join(", ") ?? ""}
              placeholder="Separadas por coma. Ej. pagos, facturas, deuda"
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Además del nombre, el chatbot reconoce estas palabras cuando un
              cliente pide hablar con alguien del área.
            </p>
          </div>
          {editing ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing.isActive}
                className="h-4 w-4"
              />
              Área activa
            </label>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : error ? (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      ) : null}

      <DataTable
        headers={["Nombre", "Palabras clave", "Agentes", "Estado", ""]}
        empty={areas.length === 0}
      >
        {areas.map((area) => (
          <tr key={area.id} className="hover:bg-[var(--muted)]/40">
            <td className="px-4 py-3">
              <div className="font-medium">{area.name}</div>
              {area.description ? (
                <div className="text-xs text-[var(--muted-foreground)]">
                  {area.description}
                </div>
              ) : null}
            </td>
            <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
              {area.keywords.length > 0 ? area.keywords.join(", ") : "—"}
            </td>
            <td className="px-4 py-3">{area.memberCount}</td>
            <td className="px-4 py-3">
              <Badge variant={area.isActive ? "success" : "danger"}>
                {area.isActive ? "Activa" : "Inactiva"}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(area);
                    setShowForm(false);
                    setError(null);
                  }}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(area)}
                  disabled={pending}
                >
                  Eliminar
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
