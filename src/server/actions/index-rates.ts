"use server";

import { AdjustmentIndex } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { INDEX_PERIOD_OPTIONS } from "@/lib/index-periods";
import { applyDueAdjustmentsFromIndexRates } from "@/server/services/billing";
import type { ActionResult } from "@/server/actions/users";

const RATE_INDEXES: AdjustmentIndex[] = ["IPC", "ICL", "CP"];

export async function upsertIndexRatesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const periodYear = Number(formData.get("periodYear"));
  const periodMonth = Number(formData.get("periodMonth"));
  const periodMonths = Number(formData.get("periodMonths"));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!periodYear || !periodMonth || periodMonth < 1 || periodMonth > 12) {
    return { ok: false, error: "Año/mes inválidos." };
  }
  if (
    !periodMonths ||
    !(INDEX_PERIOD_OPTIONS as readonly number[]).includes(periodMonths)
  ) {
    return {
      ok: false,
      error: `Período inválido. Usá: ${INDEX_PERIOD_OPTIONS.join(", ")} meses.`,
    };
  }

  const values: { indexType: AdjustmentIndex; percent: number }[] = [];
  for (const indexType of RATE_INDEXES) {
    const raw = String(formData.get(`percent_${indexType}`) ?? "").trim();
    if (!raw) continue;
    const percent = Number(raw);
    if (!(percent >= 0)) {
      return { ok: false, error: `Porcentaje inválido para ${indexType}.` };
    }
    values.push({ indexType, percent });
  }

  if (values.length === 0) {
    return { ok: false, error: "Cargá al menos un índice (IPC, ICL o CP)." };
  }

  try {
    await prisma.$transaction(
      values.map((v) =>
        prisma.indexRate.upsert({
          where: {
            organizationId_indexType_periodYear_periodMonth_periodMonths: {
              organizationId: session.organizationId,
              indexType: v.indexType,
              periodYear,
              periodMonth,
              periodMonths,
            },
          },
          create: {
            organizationId: session.organizationId,
            indexType: v.indexType,
            periodYear,
            periodMonth,
            periodMonths,
            percent: v.percent,
            notes: notes || null,
          },
          update: {
            percent: v.percent,
            notes: notes || null,
          },
        }),
      ),
    );

    const rates = await getMaxIndexPercent(
      session.organizationId,
      periodYear,
      periodMonth,
      periodMonths,
    );

    let adjustMsg = "";
    if (rates.max != null && rates.max > 0) {
      const result = await applyDueAdjustmentsFromIndexRates({
        organizationId: session.organizationId,
        periodYear,
        periodMonth,
        periodMonths,
        percent: rates.max,
      });
      if (result.applied > 0) {
        adjustMsg = ` Se aplicó ${result.percent}% (máx. IPC/ICL/CP) a ${result.applied} contrato${result.applied === 1 ? "" : "s"} desde ${result.effective!.month}/${result.effective!.year}.`;
      } else {
        adjustMsg =
          " No había contratos pendientes de aumento para el mes siguiente con ese período.";
      }
    }

    revalidatePath("/contratos");
    revalidatePath("/cobros");
    revalidatePath("/cobros/cuenta-corriente");
    return {
      ok: true,
      message: `Índices guardados para ${periodMonth}/${periodYear} · ${periodMonths} meses.${adjustMsg}`,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "No se pudieron guardar los índices",
    };
  }
}

/** % de un índice para año/mes + duración de período. */
export async function getIndexPercent(
  organizationId: string,
  indexType: AdjustmentIndex,
  periodYear: number,
  periodMonth: number,
  periodMonths: number,
): Promise<number | null> {
  const row = await prisma.indexRate.findUnique({
    where: {
      organizationId_indexType_periodYear_periodMonth_periodMonths: {
        organizationId,
        indexType,
        periodYear,
        periodMonth,
        periodMonths,
      },
    },
  });
  return row ? Number(row.percent) : null;
}

/** Mayor % entre ICL/IPC/CP para año/mes + duración de período. */
export async function getMaxIndexPercent(
  organizationId: string,
  periodYear: number,
  periodMonth: number,
  periodMonths: number,
): Promise<{
  max: number | null;
  ipc: number | null;
  icl: number | null;
  cp: number | null;
}> {
  const rows = await prisma.indexRate.findMany({
    where: {
      organizationId,
      periodYear,
      periodMonth,
      periodMonths,
      indexType: { in: ["IPC", "ICL", "CP"] },
    },
  });
  const byType = Object.fromEntries(
    rows.map((r) => [r.indexType, Number(r.percent)]),
  ) as Record<string, number>;
  const ipc = byType.IPC ?? null;
  const icl = byType.ICL ?? null;
  const cp = byType.CP ?? null;
  const present = [ipc, icl, cp].filter((v): v is number => v != null);
  return {
    ipc,
    icl,
    cp,
    max: present.length ? Math.max(...present) : null,
  };
}
