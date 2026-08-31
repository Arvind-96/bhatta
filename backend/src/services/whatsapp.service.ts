import { env } from "../config/env";

export function isWhatsAppConfigured() {
  return !!(env.whatsappPhoneNumberId && env.whatsappAccessToken);
}

// Thin wrapper around Meta's WhatsApp Business Cloud API — no SDK
// dependency, just the one REST call this app actually needs (a plain
// text message to a phone number that has messaged this business number
// within the last 24h, or that has opted in — the same constraint any
// WhatsApp Cloud API integration operates under). Deliberately does not
// throw when unconfigured; callers check isWhatsAppConfigured() first and
// surface a clean "not set up yet" response instead of a 500.
export async function sendWhatsAppText(to: string, body: string) {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp is not configured — set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN");
  }

  const url = `https://graph.facebook.com/v20.0/${env.whatsappPhoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.whatsappAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}): ${errorBody}`);
  }

  return res.json();
}
