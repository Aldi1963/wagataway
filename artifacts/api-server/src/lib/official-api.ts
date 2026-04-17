import { logger } from "./logger";

export interface OfficialConfig {
  phoneId: string;
  accessToken: string;
}

export async function sendOfficialMessage(config: OfficialConfig, jid: string, message: any) {
  const phone = jid.split("@")[0];

  // ── Simulation Mode ────────────────────────────────────────────────────────
  if (config.accessToken === "SIMULATE") {
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

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to send official message");
    }

    return data;
  } catch (error) {
    logger.error({ error, phone, phoneId: config.phoneId }, "Error sending official message");
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
            return {
              type: "reply",
              reply: {
                id: b.id || `btn_${i}`,
                title: (b.displayText || b.title).substring(0, 20),
              }
            };
          }
          return {
            type: "reply",
            reply: {
              id: b.id || `btn_${i}`,
              title: (b.displayText || b.title).substring(0, 20),
            }
          };
        })
      }
    }
  };
}
