import { logger } from "./logger";

export interface OfficialSendOptions {
  phoneId: string;
  accessToken: string;
  to: string;
  message: any;
}

export async function sendOfficialMessage({
  phoneId,
  accessToken,
  to,
  message,
}: OfficialSendOptions) {
  const phone = to.replace(/\D/g, "");

  // ── Simulation Mode ────────────────────────────────────────────────────────
  if (accessToken === "SIMULATE") {
    logger.info({ phone, message }, "[OFFICIAL-SIM] Simulating API call to Meta");
    return {
      messaging_product: "whatsapp",
      contacts: [{ input: phone, wa_id: phone }],
      messages: [{ id: `wamid.HBgL${Math.random().toString(36).substring(7).toUpperCase()}` }]
    };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        ...message,
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to send official message");
    }

    return data;
  } catch (error) {
    logger.error({ error, phone, phoneId }, "Error sending official message");
    throw error;
  }
}

export interface OfficialInteractiveOptions {
  type: "button" | "list";
  body: string;
  footer?: string;
  header?: any;
  buttons?: any[];
}

export function formatOfficialInteractive({
  type,
  body,
  footer,
  header,
  buttons = [],
}: OfficialInteractiveOptions) {
  return {
    type: "interactive",
    interactive: {
      type: type || "button",
      ...(header ? { header } : {}),
      body: { text: body },
      footer: { text: footer || "" },
      action: {
        buttons: (buttons || []).map((b, i) => {
          return {
            type: "reply",
            reply: {
              id: b.id || `btn_${i}`,
              title: (b.displayText || b.title || "Button").substring(0, 20),
            }
          };
        })
      }
    }
  };
}
