import type { WhatsAppCredentials } from "@/features/whatsapp/lib/config";

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

type SendTextInput = {
  credentials: WhatsAppCredentials;
  toPhone: string;
  body: string;
};

type SendListInput = {
  credentials: WhatsAppCredentials;
  toPhone: string;
  body: string;
  buttonLabel: string;
  rows: Array<{ id: string; title: string; description?: string }>;
};

function graphUrl(credentials: WhatsAppCredentials, path: string): string {
  return `https://graph.facebook.com/${credentials.graphApiVersion}/${path}`;
}

async function postMessage(
  credentials: WhatsAppCredentials,
  payload: Record<string, unknown>,
): Promise<{ messages?: Array<{ id: string }> }> {
  const res = await fetch(
    graphUrl(credentials, `${credentials.phoneNumberId}/messages`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number };
    messages?: Array<{ id: string }>;
  };

  if (!res.ok) {
    throw new WhatsAppApiError(
      data.error?.message ?? `WhatsApp API error ${res.status}`,
      res.status,
      data,
    );
  }

  return data;
}

export async function sendWhatsAppText({
  credentials,
  toPhone,
  body,
}: SendTextInput): Promise<string | null> {
  const data = await postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone,
    type: "text",
    text: { preview_url: false, body },
  });
  return data.messages?.[0]?.id ?? null;
}

export async function sendWhatsAppButtons({
  credentials,
  toPhone,
  body,
  buttons,
}: {
  credentials: WhatsAppCredentials;
  toPhone: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
}): Promise<string | null> {
  const data = await postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
  return data.messages?.[0]?.id ?? null;
}

export async function sendWhatsAppList({
  credentials,
  toPhone,
  body,
  buttonLabel,
  rows,
}: SendListInput): Promise<string | null> {
  const data = await postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            title: "Opciones",
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  });
  return data.messages?.[0]?.id ?? null;
}

export async function markWhatsAppMessageRead(
  credentials: WhatsAppCredentials,
  waMessageId: string,
): Promise<void> {
  await postMessage(credentials, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: waMessageId,
  }).catch((err) => {
    console.warn("markWhatsAppMessageRead", waMessageId, err);
  });
}
