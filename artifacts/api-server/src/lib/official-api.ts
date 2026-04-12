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

  const url = `https://graph.facebook.com/v21.0/${config.phoneId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
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
    logger.error({ error, phone, config: config.phoneId }, "Error sending official message");
    throw error;
  }
}

export function formatOfficialInteractive(text: string, footer: string, buttons: any[]) {
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      footer: { text: footer || "" },
      action: {
        buttons: buttons.map((b, i) => {
          if (b.type === "url") {
            // Official Cloud API Buttons are limited for 'button' type
            // Usually we use 'template' for URLs or another interactive type
            // But for simple 'button' type, it's usually just quick_reply
            // For URL/Call, we should ideally use 'template' or 'cta'
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
