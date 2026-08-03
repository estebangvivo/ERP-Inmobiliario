"use server";

import { revalidatePath } from "next/cache";
import type { FeatureRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthSession, requireSession } from "@/lib/auth";
import { isPlatformSuperadmin } from "@/features/auth/lib/platform-admin";
import {
  notifyFeatureRequestUser,
  notifyPlatformSuperadmins,
} from "@/features/feature-requests/lib/notify";
import { FEATURE_REQUEST_STATUS_LABEL } from "@/features/feature-requests/lib/labels";
import {
  collectMediaFilesFromFormData,
  saveFeatureRequestMediaFile,
} from "@/lib/uploads";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function revalidateFeaturePaths(requestId?: string) {
  revalidatePath("/solicitudes");
  revalidatePath("/admin");
  if (requestId) revalidatePath(`/solicitudes/${requestId}`);
}

async function saveRequestMedia(
  organizationId: string,
  requestId: string,
  files: File[],
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const saved = await saveFeatureRequestMediaFile({
      organizationId,
      requestId,
      file,
    });
    urls.push(saved.fileUrl);
  }
  return urls;
}

export async function listMyFeatureRequests() {
  const session = await requireSession();
  const rows = await prisma.featureRequest.findMany({
    where: {
      organizationId: session.organizationId,
      createdById: session.user.id,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    quoteAmount: r.quoteAmount ? Number(r.quoteAmount) : null,
    quoteCurrency: r.quoteCurrency,
    attachmentCount: r.attachmentUrls.length,
    messageCount: r._count.messages,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getFeatureRequestDetail(requestId: string) {
  const session = await requireAuthSession();
  const superadmin = isPlatformSuperadmin(session);

  if (!superadmin && !session.organizationId) return null;

  const row = await prisma.featureRequest.findFirst({
    where: {
      id: requestId,
      ...(superadmin
        ? {}
        : {
            organizationId: session.organizationId!,
            createdById: session.user.id,
          }),
    },
    include: {
      organization: { select: { id: true, name: true } },
      createdBy: {
        select: { id: true, email: true, name: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    attachmentUrls: row.attachmentUrls,
    quoteAmount: row.quoteAmount ? Number(row.quoteAmount) : null,
    quoteCurrency: row.quoteCurrency,
    quoteNotes: row.quoteNotes,
    quotedAt: row.quotedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    createdById: row.createdById,
    createdByEmail: row.createdBy.email,
    createdByName:
      row.createdBy.name || row.createdBy.email,
    isOwner: row.createdById === session.user.id,
    isStaffView: superadmin,
    messages: row.messages.map((m) => ({
      id: m.id,
      body: m.body,
      authorKind: m.authorKind,
      attachmentUrls: m.attachmentUrls,
      createdAt: m.createdAt.toISOString(),
      authorName:
        m.author.name ||
        m.author.email,
      authorEmail: m.author.email,
    })),
  };
}

export async function createFeatureRequest(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!title) return { ok: false, error: "El título es obligatorio." };
    if (description.length < 10) {
      return {
        ok: false,
        error: "Describí la mejora con al menos 10 caracteres.",
      };
    }

    let mediaFiles: File[] = [];
    try {
      mediaFiles = collectMediaFilesFromFormData(formData, "media");
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Archivos inválidos.",
      };
    }

    const request = await prisma.featureRequest.create({
      data: {
        organizationId: session.organizationId,
        createdById: session.user.id,
        title,
        description,
        status: "OPEN",
      },
      include: {
        organization: { select: { name: true } },
      },
    });

    let urls: string[] = [];
    if (mediaFiles.length > 0) {
      try {
        urls = await saveRequestMedia(
          session.organizationId,
          request.id,
          mediaFiles,
        );
      } catch (error) {
        console.error("createFeatureRequest media", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "No se pudieron subir los archivos.",
        };
      }
    }

    await prisma.$transaction([
      prisma.featureRequest.update({
        where: { id: request.id },
        data: { attachmentUrls: urls },
      }),
      prisma.featureRequestMessage.create({
        data: {
          requestId: request.id,
          authorId: session.user.id,
          authorKind: "USER",
          body: description,
          attachmentUrls: urls,
        },
      }),
    ]);

    const requester =
      session.user.name || session.user.email;

    await notifyPlatformSuperadmins({
      type: "FEATURE_REQUEST_NEW",
      title: "Nueva solicitud de mejora",
      body: `${requester} (${request.organization.name}): ${title}`,
      href: "/admin?tab=requests",
      excludeUserId: session.user.id,
      contextOrganizationId: request.organizationId,
    });

    revalidateFeaturePaths(request.id);
    return { ok: true, id: request.id };
  } catch (error) {
    console.error("createFeatureRequest", error);
    return { ok: false, error: "No se pudo crear la solicitud." };
  }
}

export async function addFeatureRequestUserMessage(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const requestId = String(formData.get("requestId") ?? "").trim();
    const text = String(formData.get("body") ?? "").trim();

    let mediaFiles: File[] = [];
    try {
      mediaFiles = collectMediaFilesFromFormData(formData, "media");
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Archivos inválidos.",
      };
    }

    if (!text && mediaFiles.length === 0) {
      return { ok: false, error: "Escribí un mensaje o adjuntá un archivo." };
    }

    const request = await prisma.featureRequest.findFirst({
      where: {
        id: requestId,
        organizationId: session.organizationId,
        createdById: session.user.id,
      },
      include: { organization: { select: { name: true } } },
    });
    if (!request) return { ok: false, error: "Solicitud no encontrada." };
    if (["CLOSED", "REJECTED", "IMPLEMENTED"].includes(request.status)) {
      return {
        ok: false,
        error: "Esta solicitud ya está cerrada y no admite mensajes.",
      };
    }

    let urls: string[] = [];
    if (mediaFiles.length > 0) {
      urls = await saveRequestMedia(
        session.organizationId,
        requestId,
        mediaFiles,
      );
    }

    await prisma.$transaction([
      prisma.featureRequestMessage.create({
        data: {
          requestId,
          authorId: session.user.id,
          authorKind: "USER",
          body: text || "(Adjunto)",
          attachmentUrls: urls,
        },
      }),
      prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          status:
            request.status === "AWAITING_USER" ? "IN_REVIEW" : request.status,
        },
      }),
    ]);

    await notifyPlatformSuperadmins({
      type: "FEATURE_REQUEST_REPLY",
      title: "Respuesta en solicitud de mejora",
      body: `${request.organization.name}: ${request.title}`,
      href: "/admin?tab=requests",
      excludeUserId: session.user.id,
      contextOrganizationId: request.organizationId,
    });

    revalidateFeaturePaths(requestId);
    return { ok: true, id: requestId };
  } catch (error) {
    console.error("addFeatureRequestUserMessage", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
    };
  }
}

export async function acceptFeatureRequestQuote(
  requestId: string,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const request = await prisma.featureRequest.findFirst({
      where: {
        id: requestId,
        organizationId: session.organizationId,
        createdById: session.user.id,
        status: "QUOTED",
      },
    });
    if (!request) {
      return { ok: false, error: "No hay una cotización pendiente." };
    }

    await prisma.$transaction([
      prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          decidedAt: new Date(),
          decidedById: session.user.id,
        },
      }),
      prisma.featureRequestMessage.create({
        data: {
          requestId,
          authorId: session.user.id,
          authorKind: "USER",
          body: "Acepté la cotización. Pueden avanzar con la implementación.",
        },
      }),
    ]);

    await notifyPlatformSuperadmins({
      type: "FEATURE_REQUEST_ACCEPTED",
      title: "Cotización aceptada",
      body: request.title,
      href: "/admin?tab=requests",
      excludeUserId: session.user.id,
      contextOrganizationId: request.organizationId,
    });

    revalidateFeaturePaths(requestId);
    return { ok: true, id: requestId };
  } catch (error) {
    console.error("acceptFeatureRequestQuote", error);
    return { ok: false, error: "No se pudo aceptar la cotización." };
  }
}

export async function rejectFeatureRequestQuote(
  requestId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const request = await prisma.featureRequest.findFirst({
      where: {
        id: requestId,
        organizationId: session.organizationId,
        createdById: session.user.id,
        status: "QUOTED",
      },
    });
    if (!request) {
      return { ok: false, error: "No hay una cotización pendiente." };
    }

    const note = reason?.trim();
    await prisma.$transaction([
      prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          decidedAt: new Date(),
          decidedById: session.user.id,
        },
      }),
      prisma.featureRequestMessage.create({
        data: {
          requestId,
          authorId: session.user.id,
          authorKind: "USER",
          body: note
            ? `Rechacé la cotización: ${note}`
            : "Rechacé la cotización.",
        },
      }),
    ]);

    await notifyPlatformSuperadmins({
      type: "FEATURE_REQUEST_REJECTED_QUOTE",
      title: "Cotización rechazada",
      body: request.title,
      href: "/admin?tab=requests",
      excludeUserId: session.user.id,
      contextOrganizationId: request.organizationId,
    });

    revalidateFeaturePaths(requestId);
    return { ok: true, id: requestId };
  } catch (error) {
    console.error("rejectFeatureRequestQuote", error);
    return { ok: false, error: "No se pudo rechazar la cotización." };
  }
}

export async function listAllFeatureRequestsForAdmin() {
  const session = await requireAuthSession();
  if (!isPlatformSuperadmin(session)) return [];

  try {
    const rows = await prisma.featureRequest.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        organization: { select: { id: true, name: true } },
        createdBy: {
          select: { email: true, name: true },
        },
        _count: { select: { messages: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      quoteAmount: r.quoteAmount ? Number(r.quoteAmount) : null,
      quoteCurrency: r.quoteCurrency,
      attachmentCount: r.attachmentUrls?.length ?? 0,
      messageCount: r._count.messages,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      organizationId: r.organization.id,
      organizationName: r.organization.name,
      createdByEmail: r.createdBy.email,
      createdByName: r.createdBy.name || r.createdBy.email,
    }));
  } catch (error) {
    console.error("listAllFeatureRequestsForAdmin", error);
    return [];
  }
}

export async function addFeatureRequestStaffMessage(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireAuthSession();
    if (!isPlatformSuperadmin(session)) {
      return { ok: false, error: "Sin permiso de superadmin." };
    }
    const requestId = String(formData.get("requestId") ?? "").trim();
    const text = String(formData.get("body") ?? "").trim();
    const awaitUser = String(formData.get("awaitUser") ?? "1") !== "0";

    let mediaFiles: File[] = [];
    try {
      mediaFiles = collectMediaFilesFromFormData(formData, "media");
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Archivos inválidos.",
      };
    }

    if (!text && mediaFiles.length === 0) {
      return { ok: false, error: "Escribí un mensaje o adjuntá un archivo." };
    }

    const request = await prisma.featureRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) return { ok: false, error: "Solicitud no encontrada." };

    let urls: string[] = [];
    if (mediaFiles.length > 0) {
      urls = await saveRequestMedia(
        request.organizationId,
        requestId,
        mediaFiles,
      );
    }

    await prisma.$transaction([
      prisma.featureRequestMessage.create({
        data: {
          requestId,
          authorId: session.user.id,
          authorKind: "STAFF",
          body: text || "(Adjunto)",
          attachmentUrls: urls,
        },
      }),
      prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          status: awaitUser
            ? "AWAITING_USER"
            : request.status === "OPEN"
              ? "IN_REVIEW"
              : request.status,
        },
      }),
    ]);

    await notifyFeatureRequestUser({
      organizationId: request.organizationId,
      userId: request.createdById,
      type: "FEATURE_REQUEST_STAFF_REPLY",
      title: "Consulta sobre tu solicitud",
      body: request.title,
      href: `/solicitudes/${requestId}`,
    });

    revalidateFeaturePaths(requestId);
    return { ok: true, id: requestId };
  } catch (error) {
    console.error("addFeatureRequestStaffMessage", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
    };
  }
}

export async function quoteFeatureRequest(
  requestId: string,
  input: {
    amount: number;
    currency: string;
    notes?: string;
  },
): Promise<ActionResult> {
  try {
    const session = await requireAuthSession();
    if (!isPlatformSuperadmin(session)) {
      return { ok: false, error: "Sin permiso de superadmin." };
    }
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      return { ok: false, error: "Monto inválido." };
    }
    const currency = input.currency.trim().toUpperCase() || "USD";
    const notes = input.notes?.trim() || null;

    const request = await prisma.featureRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) return { ok: false, error: "Solicitud no encontrada." };

    const quoteLine = `Cotización: ${currency} ${input.amount.toLocaleString("es-AR")}${
      notes ? `\n${notes}` : ""
    }`;

    await prisma.$transaction([
      prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          status: "QUOTED",
          quoteAmount: input.amount,
          quoteCurrency: currency,
          quoteNotes: notes,
          quotedAt: new Date(),
          quotedById: session.user.id,
        },
      }),
      prisma.featureRequestMessage.create({
        data: {
          requestId,
          authorId: session.user.id,
          authorKind: "STAFF",
          body: quoteLine,
        },
      }),
    ]);

    await notifyFeatureRequestUser({
      organizationId: request.organizationId,
      userId: request.createdById,
      type: "FEATURE_REQUEST_QUOTED",
      title: "Cotización de tu solicitud",
      body: `${request.title} · ${currency} ${input.amount.toLocaleString("es-AR")}`,
      href: `/solicitudes/${requestId}`,
    });

    revalidateFeaturePaths(requestId);
    return { ok: true, id: requestId };
  } catch (error) {
    console.error("quoteFeatureRequest", error);
    return { ok: false, error: "No se pudo cotizar la solicitud." };
  }
}

export async function updateFeatureRequestStatus(
  requestId: string,
  status: FeatureRequestStatus,
  note?: string,
): Promise<ActionResult> {
  try {
    const session = await requireAuthSession();
    if (!isPlatformSuperadmin(session)) {
      return { ok: false, error: "Sin permiso de superadmin." };
    }

    const request = await prisma.featureRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) return { ok: false, error: "Solicitud no encontrada." };

    const decided =
      status === "APPROVED" ||
      status === "REJECTED" ||
      status === "IMPLEMENTED" ||
      status === "CLOSED";

    await prisma.featureRequest.update({
      where: { id: requestId },
      data: {
        status,
        ...(decided
          ? { decidedAt: new Date(), decidedById: session.user.id }
          : {}),
      },
    });

    const text = note?.trim();
    if (text) {
      await prisma.featureRequestMessage.create({
        data: {
          requestId,
          authorId: session.user.id,
          authorKind: "STAFF",
          body: text,
        },
      });
    }

    await notifyFeatureRequestUser({
      organizationId: request.organizationId,
      userId: request.createdById,
      type: "FEATURE_REQUEST_STATUS",
      title: "Actualización de tu solicitud",
      body: `${request.title} · ${FEATURE_REQUEST_STATUS_LABEL[status]}`,
      href: `/solicitudes/${requestId}`,
    });

    revalidateFeaturePaths(requestId);
    return { ok: true, id: requestId };
  } catch (error) {
    console.error("updateFeatureRequestStatus", error);
    return { ok: false, error: "No se pudo actualizar el estado." };
  }
}
