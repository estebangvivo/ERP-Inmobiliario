"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Currency,
  OperationType,
  PropertyStatus,
  PropertyType,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createPropertyAction,
  updatePropertyAction,
} from "@/server/actions/properties";
import type { ActionResult } from "@/server/actions/users";
import {
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
  STATUS_LABELS,
} from "@/server/validators/property";

const initial: ActionResult | null = null;

type OwnerOption = { id: string; name: string };
type UnitOption = { id: string; label: string };

type PropertyFormProps = {
  owners: OwnerOption[];
  units: UnitOption[];
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      property: {
        id: string;
        title: string;
        description: string | null;
        propertyType: PropertyType;
        operationType: OperationType;
        status: PropertyStatus;
        price: string;
        currency: Currency;
        address: string;
        city: string;
        province: string | null;
        rooms: number | null;
        bathrooms: number | null;
        areaM2: string | null;
        amenities: string[];
        videoUrl: string | null;
        unitId: string | null;
        ownerId: string | null;
        coverImageUrl: string | null;
      };
    }
);

export function PropertyForm(props: PropertyFormProps) {
  const router = useRouter();
  const action = props.mode === "create" ? createPropertyAction : updatePropertyAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const p = props.mode === "edit" ? props.property : null;

  useEffect(() => {
    if (state?.ok) {
      router.push("/gestion/propiedades");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Título</Label>
          <Input id="title" name="title" defaultValue={p?.title} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea id="description" name="description" defaultValue={p?.description ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="propertyType">Tipo</Label>
          <Select id="propertyType" name="propertyType" defaultValue={p?.propertyType ?? "APARTMENT"}>
            {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((k) => (
              <option key={k} value={k}>{PROPERTY_TYPE_LABELS[k]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="operationType">Operación</Label>
          <Select id="operationType" name="operationType" defaultValue={p?.operationType ?? "RENT"}>
            {(Object.keys(OPERATION_LABELS) as OperationType[]).map((k) => (
              <option key={k} value={k}>{OPERATION_LABELS[k]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <Select id="status" name="status" defaultValue={p?.status ?? "DRAFT"}>
            {(Object.keys(STATUS_LABELS) as PropertyStatus[]).map((k) => (
              <option key={k} value={k}>{STATUS_LABELS[k]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Moneda</Label>
          <Select id="currency" name="currency" defaultValue={p?.currency ?? "ARS"}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Precio</Label>
          <Input id="price" name="price" type="number" step="0.01" defaultValue={p?.price} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ownerId">Propietario</Label>
          <Select id="ownerId" name="ownerId" defaultValue={p?.ownerId ?? ""}>
            <option value="">Sin asignar</option>
            {props.owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" name="address" defaultValue={p?.address} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Ciudad</Label>
          <Input id="city" name="city" defaultValue={p?.city} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="province">Provincia</Label>
          <Input id="province" name="province" defaultValue={p?.province ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitId">Unidad (edificio)</Label>
          <Select id="unitId" name="unitId" defaultValue={p?.unitId ?? ""}>
            <option value="">Propiedad independiente</option>
            {props.units.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rooms">Ambientes</Label>
          <Input id="rooms" name="rooms" type="number" defaultValue={p?.rooms ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bathrooms">Baños</Label>
          <Input id="bathrooms" name="bathrooms" type="number" defaultValue={p?.bathrooms ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="areaM2">Superficie m²</Label>
          <Input id="areaM2" name="areaM2" type="number" step="0.01" defaultValue={p?.areaM2 ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amenities">Amenities (separados por coma)</Label>
          <Input id="amenities" name="amenities" defaultValue={p?.amenities.join(", ") ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="videoUrl">URL video tour</Label>
          <Input id="videoUrl" name="videoUrl" defaultValue={p?.videoUrl ?? ""} />
        </div>
        {props.mode === "create" ? (
          <div className="space-y-2 sm:col-span-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/40 p-3 text-sm text-[var(--muted-foreground)]">
            Después de crear la propiedad vas a poder subir fotos desde la pantalla de edición.
            También podés pegar una URL de portada opcional ahora:
            <Input id="coverImageUrl" name="coverImageUrl" placeholder="https://..." className="mt-2" />
          </div>
        ) : null}
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : props.mode === "create" ? "Crear propiedad" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/gestion/propiedades")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
