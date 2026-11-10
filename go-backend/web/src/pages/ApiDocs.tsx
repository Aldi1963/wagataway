import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  Send,
  FlaskConical,
  Check,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";



function CurlBlock({ title, code }: { title: string; code: string }) {
  const { t } = useLang();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("apiDocs.curlCopied"));
    } catch {
      toast.error(t("apiDocs.copyFailed"));
    }
  };
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/60 border-b border-border">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={copy}>
          <Copy className="w-3 h-3" /> {t("apiDocs.copy")}
        </Button>
      </div>
      <pre className="p-3 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre bg-card">
        {code}
      </pre>
    </div>
  );
}

/* ── Referensi endpoint ─────────────────────────────── */

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Param {
  name: string;
  type: string;
  required: boolean;
  desc: string;
}

interface EndpointDoc {
  method: HttpMethod;
  path: string;
  title: string;
  curl: string;
  params?: Param[];
  note?: string;
  bodyExample?: string;
}

interface GroupDoc {
  title: string;
  desc: string;
  endpoints: EndpointDoc[];
}

const methodStyle: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  POST: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  PUT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  PATCH: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function buildGroups(baseUrl: string, t: (key: string) => string): GroupDoc[] {
  const curl = (method: string, path: string, body?: string) => {
    const lines = [
      `curl -X ${method} \\`,
      `  ${baseUrl}${path} \\`,
      `  -H "X-API-Key: YOUR_API_KEY" \\`,
      `  -H "Content-Type: application/json"`,
    ];
    if (body) lines.push(`  -d '${body}'`);
    return lines.join("\n");
  };

  const J = (o: object) => JSON.stringify(o, null, 4);

  return [
    {
      title: t("apiDocs.msgGroupTitle"),
      desc: t("apiDocs.msgGroupDesc"),
      endpoints: [
        {
          method: "POST",
          path: "/api/messages/send",
          title: t("apiDocs.msgSendTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramDestNumberFormat") },
            { name: "type", type: "string", required: false, desc: "text | image | document | audio" },
            { name: "content", type: "string", required: true, desc: t("apiDocs.paramTextContent") },
            { name: "mediaUrl", type: "string", required: false, desc: t("apiDocs.paramMediaUrlNonText") },
            { name: "caption", type: "string", required: false, desc: t("apiDocs.paramMediaCaption") },
            { name: "replyTo", type: "string", required: false, desc: t("apiDocs.paramReplyTo") },
            { name: "idempotencyKey", type: "string", required: false, desc: t("apiDocs.paramIdempotencyKey") },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", type: "text", content: "Halo dari API WaGataway!" }),
          curl: curl("POST", "/api/messages/send", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "type": "text",\n    "content": "Halo dari API WaGataway!"\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-bulk",
          title: t("apiDocs.msgSendBulkTitle"),
          params: [
            { name: "deviceId", type: "number", required: false, desc: t("apiDocs.paramLegacyDeviceId") },
            { name: "deviceIds", type: "number[]", required: false, desc: t("apiDocs.paramDeviceIds") },
            { name: "recipients", type: "string[]", required: true, desc: t("apiDocs.paramRecipients") },
            { name: "content", type: "string", required: true, desc: t("apiDocs.paramMessageContent") },
            { name: "minDelay", type: "number", required: false, desc: t("apiDocs.paramMinDelay") },
            { name: "maxDelay", type: "number", required: false, desc: t("apiDocs.paramMaxDelay") },
            { name: "autoClean", type: "boolean", required: false, desc: t("apiDocs.paramAutoClean") },
          ],
          bodyExample: J({ deviceIds: [1, 2], recipients: ["6281234567890", "6289876543210"], content: "Promo hari ini!", minDelay: 3, maxDelay: 15, autoClean: true }),
          curl: curl("POST", "/api/messages/send-bulk", `{\n    "deviceIds": [1, 2],\n    "recipients": ["6281234567890", "6289876543210"],\n    "content": "Promo hari ini!",\n    "minDelay": 3,\n    "maxDelay": 15,\n    "autoClean": true\n  }`),
          note: t("apiDocs.msgSendBulkNote"),
        },
        {
          method: "POST",
          path: "/api/messages/check-recipients",
          title: t("apiDocs.msgCheckRecipientsTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramValidateDeviceId") },
            { name: "numbers", type: "string[]", required: true, desc: t("apiDocs.paramNumbersCheck") },
          ],
          bodyExample: J({ deviceId: 1, numbers: ["6281234567890", "6280000000000"] }),
          curl: curl("POST", "/api/messages/check-recipients", `{\n    "deviceId": 1,\n    "numbers": ["6281234567890", "6280000000000"]\n  }`),
          note: t("apiDocs.msgCheckRecipientsNote"),
        },
        {
          method: "GET",
          path: "/api/messages/bulk-jobs",
          title: t("apiDocs.msgBulkJobsTitle"),
          params: [
            { name: "limit", type: "number", required: false, desc: t("apiDocs.paramBulkJobsLimit") },
          ],
          curl: curl("GET", "/api/messages/bulk-jobs?limit=20"),
          note: t("apiDocs.msgBulkJobsNote"),
        },
        {
          method: "POST",
          path: "/api/messages/send-poll",
          title: t("apiDocs.msgSendPollTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramDestNumber") },
            { name: "question", type: "string", required: true, desc: t("apiDocs.paramPollQuestion") },
            { name: "options", type: "string[]", required: true, desc: t("apiDocs.paramPollOptions") },
            { name: "allowMultiple", type: "boolean", required: false, desc: t("apiDocs.paramPollAllowMultiple") },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", question: "Pilih jadwal meeting", options: ["Senin pagi", "Selasa siang", "Rabu sore"] }),
          curl: curl("POST", "/api/messages/send-poll", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "question": "Pilih jadwal meeting",\n    "options": ["Senin pagi", "Selasa siang", "Rabu sore"]\n  }`),
          note: t("apiDocs.msgSendPollNote"),
        },
        {
          method: "POST",
          path: "/api/messages/send-interactive",
          title: t("apiDocs.msgSendInteractiveTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramDestNumber") },
            { name: "body", type: "string", required: true, desc: t("apiDocs.paramMessageContent") },
            { name: "buttons", type: "{id,title}[]", required: true, desc: t("apiDocs.paramQuickReplyButtons") },
            { name: "footer", type: "string", required: false, desc: t("apiDocs.paramFooterText") },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", body: "Mau pesan apa?", buttons: [{ id: "menu", title: "Lihat Menu" }, { id: "cs", title: "Hubungi CS" }] }),
          curl: curl("POST", "/api/messages/send-interactive", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "body": "Mau pesan apa?",\n    "buttons": [{ "id": "menu", "title": "Lihat Menu" }, { "id": "cs", "title": "Hubungi CS" }]\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-sticker",
          title: t("apiDocs.msgSendStickerTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramDestNumber") },
            { name: "mediaUrl", type: "string", required: true, desc: t("apiDocs.paramWebpUrl") },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", mediaUrl: "https://contoh.com/stiker.webp" }),
          curl: curl("POST", "/api/messages/send-sticker", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "mediaUrl": "https://contoh.com/stiker.webp"\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-voice-note",
          title: t("apiDocs.msgSendVoiceNoteTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramDestNumber") },
            { name: "mediaUrl", type: "string", required: true, desc: t("apiDocs.paramAudioUrl") },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", mediaUrl: "https://contoh.com/suara.ogg" }),
          curl: curl("POST", "/api/messages/send-voice-note", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "mediaUrl": "https://contoh.com/suara.ogg"\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-location",
          title: t("apiDocs.msgSendLocationTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramDestNumber") },
            { name: "latitude", type: "number", required: true, desc: t("apiDocs.paramLatitude") },
            { name: "longitude", type: "number", required: true, desc: t("apiDocs.paramLongitude") },
            { name: "name", type: "string", required: false, desc: t("apiDocs.paramPlaceName") },
            { name: "address", type: "string", required: false, desc: t("apiDocs.paramAddress") },
            { name: "live", type: "boolean", required: false, desc: t("apiDocs.paramLiveLocation") },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", latitude: -6.2088, longitude: 106.8456, name: "Monas", address: "Jakarta Pusat" }),
          curl: curl("POST", "/api/messages/send-location", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "latitude": -6.2088,\n    "longitude": 106.8456,\n    "name": "Monas",\n    "address": "Jakarta Pusat"\n  }`),
        },
        {
          method: "GET",
          path: "/api/messages/:id/status",
          title: t("apiDocs.msgStatusTitle"),
          curl: curl("GET", "/api/messages/1/status"),
          note: "Status: pending, sent, delivered, read, failed, revoked.",
        },
        {
          method: "DELETE",
          path: "/api/messages/:id",
          title: t("apiDocs.msgDeleteTitle"),
          curl: curl("DELETE", "/api/messages/1"),
          note: t("apiDocs.msgDeleteNote"),
        },
      ],
    },
    {
      title: t("apiDocs.pollGroupTitle"),
      desc: t("apiDocs.pollGroupDesc"),
      endpoints: [
        {
          method: "GET",
          path: "/api/polls",
          title: t("apiDocs.pollListTitle"),
          params: [
            { name: "page", type: "number", required: false, desc: t("apiDocs.paramPage") },
            { name: "limit", type: "number", required: false, desc: t("apiDocs.paramPageLimit") },
          ],
          curl: curl("GET", "/api/polls?page=1&limit=20"),
          note: t("apiDocs.pollListNote"),
        },
        {
          method: "GET",
          path: "/api/polls/:id/results",
          title: t("apiDocs.pollResultsTitle"),
          curl: curl("GET", "/api/polls/1/results"),
          note: t("apiDocs.pollResultsNote"),
        },
        {
          method: "POST",
          path: "/api/polls/:id/close",
          title: t("apiDocs.pollCloseTitle"),
          curl: curl("POST", "/api/polls/1/close"),
          note: t("apiDocs.pollCloseNote"),
        },
        {
          method: "POST",
          path: "/api/polls/:id/recap",
          title: t("apiDocs.pollRecapTitle"),
          params: [
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramGroupJid") },
          ],
          bodyExample: J({ to: "6281234567890" }),
          curl: curl("POST", "/api/polls/1/recap", `{\n    "to": "6281234567890"\n  }`),
          note: t("apiDocs.pollRecapNote"),
        },
      ],
    },
    {
      title: t("apiDocs.devGroupTitle"),
      desc: t("apiDocs.devGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/devices", title: t("apiDocs.devListTitle"), curl: curl("GET", "/api/devices") },
        {
          method: "POST",
          path: "/api/devices",
          title: t("apiDocs.devCreateTitle"),
          params: [{ name: "name", type: "string", required: true, desc: t("apiDocs.paramDeviceName") }],
          bodyExample: J({ name: "CS Toko" }),
          curl: curl("POST", "/api/devices", `{\n    "name": "CS Toko"\n  }`),
        },
        { method: "GET", path: "/api/devices/:id", title: t("apiDocs.devDetailTitle"), curl: curl("GET", "/api/devices/1") },
        {
          method: "PUT",
          path: "/api/devices/:id",
          title: t("apiDocs.devUpdateTitle"),
          bodyExample: J({ name: "CS Toko Baru" }),
          curl: curl("PUT", "/api/devices/1", `{\n    "name": "CS Toko Baru"\n  }`),
        },
        { method: "DELETE", path: "/api/devices/:id", title: t("apiDocs.devDeleteTitle"), curl: curl("DELETE", "/api/devices/1") },
        {
          method: "GET",
          path: "/api/devices/:id/qr",
          title: t("apiDocs.devQrTitle"),
          curl: curl("GET", "/api/devices/1/qr"),
          note: t("apiDocs.devQrNote"),
        },
        {
          method: "POST",
          path: "/api/devices/:id/pair-code",
          title: t("apiDocs.devPairCodeTitle"),
          params: [{ name: "phone", type: "string", required: true, desc: t("apiDocs.paramPairPhone") }],
          bodyExample: J({ phone: "6281234567890" }),
          curl: curl("POST", "/api/devices/1/pair-code", `{\n    "phone": "6281234567890"\n  }`),
          note: t("apiDocs.devPairCodeNote"),
        },
        { method: "POST", path: "/api/devices/:id/connect", title: t("apiDocs.devConnectTitle"), curl: curl("POST", "/api/devices/1/connect") },
        { method: "POST", path: "/api/devices/:id/disconnect", title: t("apiDocs.devDisconnectTitle"), curl: curl("POST", "/api/devices/1/disconnect") },
      ],
    },
    {
      title: t("apiDocs.contactGroupTitle"),
      desc: t("apiDocs.contactGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/contacts", title: t("apiDocs.contactListTitle"), curl: curl("GET", "/api/contacts?limit=20") },
        {
          method: "POST",
          path: "/api/contacts",
          title: t("apiDocs.contactCreateTitle"),
          params: [
            { name: "name", type: "string", required: true, desc: t("apiDocs.paramContactName") },
            { name: "phone", type: "string", required: true, desc: t("apiDocs.paramPhone") },
            { name: "email", type: "string", required: false, desc: t("apiDocs.paramEmail") },
          ],
          bodyExample: J({ name: "Budi", phone: "6281234567890" }),
          curl: curl("POST", "/api/contacts", `{\n    "name": "Budi",\n    "phone": "6281234567890"\n  }`),
        },
        {
          method: "PUT",
          path: "/api/contacts/:id",
          title: t("apiDocs.contactUpdateTitle"),
          bodyExample: J({ name: "Budi Santoso" }),
          curl: curl("PUT", "/api/contacts/1", `{\n    "name": "Budi Santoso"\n  }`),
        },
        { method: "DELETE", path: "/api/contacts/:id", title: t("apiDocs.contactDeleteTitle"), curl: curl("DELETE", "/api/contacts/1") },
        {
          method: "POST",
          path: "/api/contacts/import",
          title: t("apiDocs.contactImportTitle"),
          params: [{ name: "contacts", type: "array", required: true, desc: "Array {name, phone, email?}" }],
          bodyExample: J({ contacts: [{ name: "Budi", phone: "6281234567890" }, { name: "Sari", phone: "6289876543210" }] }),
          curl: curl("POST", "/api/contacts/import", `{\n    "contacts": [\n      { "name": "Budi", "phone": "6281234567890" },\n      { "name": "Sari", "phone": "6289876543210" }\n    ]\n  }`),
        },
        {
          method: "POST",
          path: "/api/contacts/validate",
          title: t("apiDocs.contactValidateTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramDeviceIdConnected") },
            { name: "numbers", type: "string[]", required: true, desc: t("apiDocs.paramValidateNumbers") },
          ],
          bodyExample: J({ deviceId: 1, numbers: ["6281234567890", "6280000000000"] }),
          curl: curl("POST", "/api/contacts/validate", `{\n    "deviceId": 1,\n    "numbers": ["6281234567890", "6280000000000"]\n  }`),
          note: t("apiDocs.contactValidateNote"),
        },
      ],
    },
    {
      title: t("apiDocs.groupGroupTitle"),
      desc: t("apiDocs.groupGroupDesc"),
      endpoints: [
        {
          method: "GET",
          path: "/api/groups",
          title: t("apiDocs.groupListTitle"),
          params: [{ name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramDeviceIdQuery") }],
          curl: curl("GET", "/api/groups?deviceId=1"),
        },
        {
          method: "POST",
          path: "/api/groups",
          title: t("apiDocs.groupCreateTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramDeviceIdConnected") },
            { name: "name", type: "string", required: true, desc: t("apiDocs.paramGroupName") },
            { name: "participants", type: "string[]", required: false, desc: t("apiDocs.paramInitialParticipants") },
          ],
          bodyExample: J({ deviceId: 1, name: "Tim CS Toko", participants: ["6281234567890"] }),
          curl: curl("POST", "/api/groups", `{\n    "deviceId": 1,\n    "name": "Tim CS Toko",\n    "participants": ["6281234567890"]\n  }`),
        },
        {
          method: "POST",
          path: "/api/groups/:jid/participants",
          title: t("apiDocs.groupParticipantsTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramDeviceId") },
            { name: "action", type: "string", required: true, desc: "add | remove" },
            { name: "participants", type: "string[]", required: true, desc: t("apiDocs.paramGroupParticipants") },
          ],
          bodyExample: J({ deviceId: 1, action: "add", participants: ["6289876543210"] }),
          curl: curl("POST", "/api/groups/120363123456@g.us/participants", `{\n    "deviceId": 1,\n    "action": "add",\n    "participants": ["6289876543210"]\n  }`),
        },
        {
          method: "PATCH",
          path: "/api/groups/:jid",
          title: t("apiDocs.groupUpdateTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramDeviceId") },
            { name: "name", type: "string", required: false, desc: t("apiDocs.paramNewGroupName") },
            { name: "topic", type: "string", required: false, desc: t("apiDocs.paramGroupTopic") },
          ],
          bodyExample: J({ deviceId: 1, name: "Tim CS Toko (baru)" }),
          curl: curl("PATCH", "/api/groups/120363123456@g.us", `{\n    "deviceId": 1,\n    "name": "Tim CS Toko (baru)"\n  }`),
        },
      ],
    },
    {
      title: t("apiDocs.chatGroupTitle"),
      desc: t("apiDocs.chatGroupDesc"),
      endpoints: [
        {
          method: "GET",
          path: "/api/chat/history",
          title: t("apiDocs.chatHistoryTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramDeviceIdQuery") },
            { name: "phone", type: "string", required: true, desc: t("apiDocs.paramChatPhone") },
            { name: "limit", type: "number", required: false, desc: t("apiDocs.paramChatLimit") },
            { name: "before", type: "string", required: false, desc: t("apiDocs.paramChatBefore") },
          ],
          curl: curl("GET", "/api/chat/history?deviceId=1&phone=6281234567890&limit=50"),
          note: t("apiDocs.chatHistoryNote"),
        },
      ],
    },
    {
      title: t("apiDocs.menuBotGroupTitle"),
      desc: t("apiDocs.menuBotGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/menu-bots", title: t("apiDocs.menuBotListTitle"), curl: curl("GET", "/api/menu-bots") },
        {
          method: "POST",
          path: "/api/menu-bots",
          title: t("apiDocs.menuBotCreateTitle"),
          bodyExample: J({ name: "Menu Utama", deviceId: 1, triggerKeyword: "menu", introText: "Halo! Silakan pilih:", alwaysActive: false }),
          curl: curl("POST", "/api/menu-bots"),
        },
        { method: "GET", path: "/api/menu-bots/:id", title: t("apiDocs.menuBotDetailTitle"), curl: curl("GET", "/api/menu-bots/1") },
        {
          method: "PUT",
          path: "/api/menu-bots/:id",
          title: t("apiDocs.menuBotUpdateTitle"),
          bodyExample: J({ introText: "Halo kak, pilih layanan:", alwaysActive: true }),
          curl: curl("PUT", "/api/menu-bots/1"),
        },
        { method: "DELETE", path: "/api/menu-bots/:id", title: t("apiDocs.menuBotDeleteTitle"), curl: curl("DELETE", "/api/menu-bots/1") },
        { method: "PATCH", path: "/api/menu-bots/:id/toggle", title: t("apiDocs.menuBotToggleTitle"), curl: curl("PATCH", "/api/menu-bots/1/toggle") },
        {
          method: "POST",
          path: "/api/menu-bots/:id/items",
          title: t("apiDocs.menuBotItemCreateTitle"),
          bodyExample: J({ label: "Jam operasional", actionType: "reply", replyText: "Kami buka 08.00–21.00 WIB." }),
          curl: curl("POST", "/api/menu-bots/1/items"),
          note: t("apiDocs.menuBotItemCreateNote"),
        },
        {
          method: "PUT",
          path: "/api/menu-bots/:id/items/:itemId",
          title: t("apiDocs.menuBotItemUpdateTitle"),
          bodyExample: J({ label: "Info harga", actionType: "submenu", subMenuId: 2 }),
          curl: curl("PUT", "/api/menu-bots/1/items/5"),
        },
        { method: "DELETE", path: "/api/menu-bots/:id/items/:itemId", title: t("apiDocs.menuBotItemDeleteTitle"), curl: curl("DELETE", "/api/menu-bots/1/items/5") },
        { method: "GET", path: "/api/menu-bots/:id/sessions", title: t("apiDocs.menuBotSessionsTitle"), curl: curl("GET", "/api/menu-bots/1/sessions") },
        { method: "DELETE", path: "/api/menu-bots/sessions/:sessionId", title: t("apiDocs.menuBotSessionDeleteTitle"), curl: curl("DELETE", "/api/menu-bots/sessions/9") },
      ],
    },
    {
      title: t("apiDocs.welcomeDmGroupTitle"),
      desc: t("apiDocs.welcomeDmGroupDesc"),
      endpoints: [
        {
          method: "GET",
          path: "/api/contact-groups/:id/welcome-dm",
          title: t("apiDocs.welcomeDmGetTitle"),
          curl: curl("GET", "/api/contact-groups/1/welcome-dm"),
          note: t("apiDocs.welcomeDmGetNote"),
        },
        {
          method: "PUT",
          path: "/api/contact-groups/:id/welcome-dm",
          title: t("apiDocs.welcomeDmSetTitle"),
          params: [
            { name: "enabled", type: "boolean", required: true, desc: t("apiDocs.paramWelcomeDmEnabled") },
            { name: "template", type: "string", required: false, desc: t("apiDocs.paramWelcomeDmTemplate") },
          ],
          bodyExample: J({ enabled: true, template: "Halo {nama}, selamat datang di {grup}! 🙏" }),
          curl: curl("PUT", "/api/contact-groups/1/welcome-dm", `{\\n    "enabled": true,\\n    "template": "Halo {nama}, selamat datang di {grup}! 🙏"\\n  }`),
        },
      ],
    },
    {
      title: t("apiDocs.tplGroupTitle"),
      desc: t("apiDocs.tplGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/templates", title: t("apiDocs.tplListTitle"), curl: curl("GET", "/api/templates") },
        {
          method: "POST",
          path: "/api/templates",
          title: t("apiDocs.tplCreateTitle"),
          params: [
            { name: "name", type: "string", required: true, desc: t("apiDocs.paramTemplateName") },
            { name: "content", type: "string", required: true, desc: t("apiDocs.paramTemplateContent") },
          ],
          bodyExample: J({ name: "Salam pembuka", content: "Halo kak, ada yang bisa kami bantu?" }),
          curl: curl("POST", "/api/templates", `{\n    "name": "Salam pembuka",\n    "content": "Halo kak, ada yang bisa kami bantu?"\n  }`),
        },
        {
          method: "PUT",
          path: "/api/templates/:id",
          title: t("apiDocs.tplUpdateTitle"),
          bodyExample: J({ content: "Halo kak, ada yang bisa kami bantu? (baru)" }),
          curl: curl("PUT", "/api/templates/1", `{\n    "content": "Halo kak..."\n  }`),
        },
        { method: "DELETE", path: "/api/templates/:id", title: t("apiDocs.tplDeleteTitle"), curl: curl("DELETE", "/api/templates/1") },
      ],
    },
    {
      title: t("apiDocs.schedGroupTitle"),
      desc: t("apiDocs.schedGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/schedule", title: t("apiDocs.schedListTitle"), curl: curl("GET", "/api/schedule") },
        { method: "GET", path: "/api/schedules", title: t("apiDocs.schedListAliasTitle"), curl: curl("GET", "/api/schedules?status=pending") },
        {
          method: "POST",
          path: "/api/schedule",
          title: t("apiDocs.schedCreateTitle"),
          params: [
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramDestNumber") },
            { name: "content", type: "string", required: true, desc: t("apiDocs.paramMessageContent") },
            { name: "sendAt", type: "string", required: true, desc: t("apiDocs.paramSendAt") },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", content: "Jangan lupa meeting jam 9!", sendAt: "2026-10-01T09:00:00+07:00" }),
          curl: curl("POST", "/api/schedule", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "content": "Jangan lupa meeting jam 9!",\n    "sendAt": "2026-10-01T09:00:00+07:00"\n  }`),
        },
        { method: "PATCH", path: "/api/schedule/:id/cancel", title: t("apiDocs.schedCancelTitle"), curl: curl("PATCH", "/api/schedule/1/cancel") },
        {
          method: "PATCH",
          path: "/api/schedules/:id",
          title: t("apiDocs.schedUpdateTitle"),
          params: [{ name: "action", type: "string", required: true, desc: "pause | resume | cancel" }],
          bodyExample: J({ action: "pause" }),
          curl: curl("PATCH", "/api/schedules/1", `{\n    "action": "pause"\n  }`),
          note: t("apiDocs.schedUpdateNote"),
        },
        { method: "DELETE", path: "/api/schedules/:id", title: t("apiDocs.schedDeleteAliasTitle"), curl: curl("DELETE", "/api/schedules/1") },
        { method: "DELETE", path: "/api/schedule/:id", title: t("apiDocs.schedDeleteTitle"), curl: curl("DELETE", "/api/schedule/1") },
      ],
    },
    {
      title: t("apiDocs.dripGroupTitle"),
      desc: t("apiDocs.dripGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/drip", title: t("apiDocs.dripListTitle"), curl: curl("GET", "/api/drip") },
        {
          method: "POST",
          path: "/api/drip",
          title: t("apiDocs.dripCreateTitle"),
          params: [
            { name: "name", type: "string", required: true, desc: t("apiDocs.paramCampaignName") },
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramSenderDeviceId") },
          ],
          bodyExample: J({ name: "Onboarding", deviceId: 1 }),
          curl: curl("POST", "/api/drip", `{\n    "name": "Onboarding",\n    "deviceId": 1\n  }`),
        },
        { method: "GET", path: "/api/drip/:id", title: t("apiDocs.dripDetailTitle"), curl: curl("GET", "/api/drip/1") },
        {
          method: "POST",
          path: "/api/drip/:id/enroll",
          title: t("apiDocs.dripEnrollTitle"),
          params: [{ name: "contactIds", type: "number[]", required: true, desc: t("apiDocs.paramContactIds") }],
          bodyExample: J({ contactIds: [1, 2, 3] }),
          curl: curl("POST", "/api/drip/1/enroll", `{\n    "contactIds": [1, 2, 3]\n  }`),
        },
        { method: "GET", path: "/api/drip/:id/analytics", title: t("apiDocs.dripAnalyticsTitle"), curl: curl("GET", "/api/drip/1/analytics") },
      ],
    },
    {
      title: t("apiDocs.whGroupTitle"),
      desc: t("apiDocs.whGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/webhooks", title: t("apiDocs.whListTitle"), curl: curl("GET", "/api/webhooks") },
        {
          method: "POST",
          path: "/api/webhooks",
          title: t("apiDocs.whCreateTitle"),
          params: [
            { name: "url", type: "string", required: true, desc: t("apiDocs.paramWebhookUrl") },
            { name: "events", type: "string[]", required: true, desc: 'cth: ["message.received", "message.sent"]' },
            { name: "secret", type: "string", required: false, desc: t("apiDocs.paramWebhookSecret") },
          ],
          bodyExample: J({ url: "https://toko.id/hook/wa", events: ["message.received", "message.sent"] }),
          curl: curl("POST", "/api/webhooks", `{\n    "url": "https://toko.id/hook/wa",\n    "events": ["message.received", "message.sent"]\n  }`),
        },
        {
          method: "PUT",
          path: "/api/webhooks/:id",
          title: t("apiDocs.whUpdateTitle"),
          bodyExample: J({ isActive: false }),
          curl: curl("PUT", "/api/webhooks/1", `{\n    "isActive": false\n  }`),
        },
        { method: "DELETE", path: "/api/webhooks/:id", title: t("apiDocs.whDeleteTitle"), curl: curl("DELETE", "/api/webhooks/1") },
        { method: "GET", path: "/api/webhooks/:id/deliveries", title: t("apiDocs.whDeliveriesTitle"), curl: curl("GET", "/api/webhooks/1/deliveries") },
        {
          method: "POST",
          path: "/api/webhooks/:id/deliveries/:deliveryId/retry",
          title: t("apiDocs.whRetryTitle"),
          curl: curl("POST", "/api/webhooks/1/deliveries/5/retry"),
        },
        {
          method: "POST",
          path: "/api/devices/:id/webhook-secret/regenerate",
          title: t("apiDocs.whSecretRegenTitle"),
          note: t("apiDocs.whSecretRegenNote"),
          curl: curl("POST", "/api/devices/1/webhook-secret/regenerate"),
        },
      ],
    },
    {
      title: t("apiDocs.integGroupTitle"),
      desc: t("apiDocs.integGroupDesc"),
      endpoints: [
        {
          method: "GET",
          path: "/api/integrations",
          title: t("apiDocs.integListTitle"),
          curl: curl("GET", "/api/integrations"),
        },
        {
          method: "POST",
          path: "/api/integrations",
          title: t("apiDocs.integCreateTitle"),
          params: [
            { name: "name", type: "string", required: true, desc: t("apiDocs.paramIntegrationName") },
            { name: "platform", type: "string", required: true, desc: t("apiDocs.paramPlatformSlug") },
            { name: "deviceId", type: "number", required: true, desc: t("apiDocs.paramIntegrationDeviceId") },
            { name: "template", type: "string", required: false, desc: t("apiDocs.paramIntegrationTemplate") },
          ],
          bodyExample: J({ name: "Notif Order Toko", platform: "woocommerce", deviceId: 1, template: "Order baru #{{id}} dari {{billing.first_name}} (Rp{{total}})" }),
          curl: curl("POST", "/api/integrations", `{\\n    "name": "Notif Order Toko",\\n    "platform": "woocommerce",\\n    "deviceId": 1,\\n    "template": "Order baru #{{id}} dari {{billing.first_name}} (Rp{{total}})"\\n  }`),
          note: t("apiDocs.integCreateNote"),
        },
        {
          method: "POST",
          path: "/api/integrations/inbox/:token",
          title: t("apiDocs.integInboxTitle"),
          params: [
            { name: "to", type: "string", required: true, desc: t("apiDocs.paramInboxTo") },
            { name: "message", type: "string", required: false, desc: t("apiDocs.paramInboxMessage") },
          ],
          bodyExample: J({ to: "62812xxxxxxx", message: "Order baru #12345 dari Budi (Rp250000)" }),
          curl: [
            `curl -X POST \\`,
            `  ${baseUrl}/api/integrations/inbox/<token-64-hex> \\`,
            `  -H "Content-Type: application/json" \\`,
            `  -d '{\\n    "to": "62812xxxxxxx",\\n    "message": "Order baru #12345 dari Budi (Rp250000)"\\n  }'`,
          ].join("\n"),
          note: t("apiDocs.integInboxNote"),
        },
        {
          method: "GET",
          path: "/api/integrations/:id",
          title: t("apiDocs.integDetailTitle"),
          curl: curl("GET", "/api/integrations/1"),
        },
        {
          method: "PUT",
          path: "/api/integrations/:id",
          title: t("apiDocs.integUpdateTitle"),
          bodyExample: J({ template: "Order #{{id}} lunas: Rp{{total}}", isActive: true }),
          curl: curl("PUT", "/api/integrations/1", `{\\n    "template": "Order #{{id}} lunas: Rp{{total}}"\\n  }`),
        },
        {
          method: "POST",
          path: "/api/integrations/:id/regenerate",
          title: t("apiDocs.integRegenTitle"),
          curl: curl("POST", "/api/integrations/1/regenerate"),
          note: t("apiDocs.integRegenNote"),
        },
        {
          method: "GET",
          path: "/api/integrations/:id/logs",
          title: t("apiDocs.integLogsTitle"),
          curl: curl("GET", "/api/integrations/1/logs?limit=50"),
          note: t("apiDocs.integLogsNote"),
        },
        { method: "DELETE", path: "/api/integrations/:id", title: t("apiDocs.integDeleteTitle"), curl: curl("DELETE", "/api/integrations/1") },
      ],
    },
    {
      title: t("apiDocs.miscGroupTitle"),
      desc: t("apiDocs.miscGroupDesc"),
      endpoints: [
        { method: "GET", path: "/api/stats/overview", title: t("apiDocs.miscStatsTitle"), curl: curl("GET", "/api/stats/overview") },
        { method: "GET", path: "/api/notifications", title: t("apiDocs.miscNotificationsTitle"), curl: curl("GET", "/api/notifications") },
        { method: "PUT", path: "/api/notifications/read-all", title: t("apiDocs.miscNotificationsReadAllTitle"), curl: curl("PUT", "/api/notifications/read-all") },
        { method: "GET", path: "/api/links", title: t("apiDocs.miscLinksTitle"), curl: curl("GET", "/api/links") },
        { method: "GET", path: "/api/blacklist", title: t("apiDocs.miscBlacklistTitle"), curl: curl("GET", "/api/blacklist") },
        { method: "GET", path: "/api/auto-reply", title: t("apiDocs.miscAutoReplyTitle"), curl: curl("GET", "/api/auto-reply") },
        {
          method: "GET",
          path: "/api/quota",
          title: t("apiDocs.miscQuotaTitle"),
          curl: curl("GET", "/api/quota"),
          note: t("apiDocs.miscQuotaNote"),
        },
      ],
    },
  ];
}

/* ── Coba langsung ala Postman ──────────────────────── */

interface TryResp {
  status: number;
  ms: number;
  text: string;
}

function prettyJson(t: string): string {
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return t;
  }
}

function TryIt({
  ep,
  baseUrl,
  apiKey,
  setApiKey,
}: {
  ep: EndpointDoc;
  baseUrl: string;
  apiKey: string;
  setApiKey: (v: string) => void;
}) {
  const { t } = useLang();
  const pathParams = useMemo(
    () => [...new Set([...ep.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]))],
    [ep.path]
  );
  const hasBody = ["POST", "PUT", "PATCH"].includes(ep.method);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [body, setBody] = useState(ep.bodyExample ?? "");
  const [resp, setResp] = useState<TryResp | null>(null);
  const [sending, setSending] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const send = async () => {
    if (!apiKey.trim()) {
      toast.error(t("apiDocs.tryNoApiKey"));
      return;
    }
    let p = ep.path;
    for (const k of pathParams) {
      const v = (vals[k] || "").trim();
      if (!v) {
        toast.error(t("apiDocs.tryPathParamRequired").replace("{key}", k));
        return;
      }
      p = p.replace(":" + k, encodeURIComponent(v));
    }
    let json: string | undefined;
    if (hasBody && body.trim()) {
      try {
        JSON.parse(body);
        json = body;
      } catch {
        toast.error(t("apiDocs.tryBodyInvalid"));
        return;
      }
    }
    const q = query.trim().replace(/^\?/, "");
    const url = baseUrl + p + (q ? "?" + q : "");
    setSending(true);
    setResp(null);
    const t0 = performance.now();
    try {
      const r = await fetch(url, {
        method: ep.method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey.trim(),
        },
        body: hasBody ? json : undefined,
      });
      const text = await r.text();
      setResp({ status: r.status, ms: Math.round(performance.now() - t0), text });
    } catch (e) {
      setResp({
        status: 0,
        ms: 0,
        text: t("apiDocs.tryConnectFailed").replace("{error}", e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setSending(false);
    }
  };

  const statusColor =
    resp == null
      ? ""
      : resp.status === 0
        ? "bg-muted text-muted-foreground border-border"
        : resp.status < 300
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          : resp.status < 500
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
            : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
      <div>
        <label className="text-xs">API Key</label>
        <div className="relative mt-1">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("apiDocs.tryApiKeyPlaceholder")}
            className="pr-10 font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? t("apiDocs.tryHideKey") : t("apiDocs.tryShowKey")}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {pathParams.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {pathParams.map((k) => (
            <div key={k}>
              <label className="text-xs">
                <code className="font-mono">:{k}</code> <span className="text-destructive">*</span>
              </label>
              <Input
                className="mt-1 font-mono text-xs"
                placeholder={t("apiDocs.tryPathExample").replace("{example}", k === "id" || k === "deliveryId" ? "1" : t("apiDocs.tryPathExampleValue"))}
                value={vals[k] || ""}
                onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {ep.method === "GET" && (
        <div>
          <label className="text-xs">{t("apiDocs.tryQueryLabel")}</label>
          <Input
            className="mt-1 font-mono text-xs"
            placeholder="limit=20&search=budi"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {hasBody && (
        <div>
          <label className="text-xs">Body (JSON)</label>
          <textarea className="mt-1 font-mono text-xs min-h-[120px] flex w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      <Button onClick={send} disabled={sending} className="gap-2" size="sm">
        {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? t("apiDocs.trySending") : t("apiDocs.trySend")}
      </Button>

      {resp && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary/60 border-b border-border">
            <span className="text-xs font-semibold">{t("apiDocs.tryResponseLabel")}</span>
            <Badge variant="outline" className={`font-mono ${statusColor}`}>
              {resp.status === 0 ? "ERR" : resp.status}
            </Badge>
            <span className="text-[11px] text-muted-foreground font-mono">{resp.ms} ms</span>
          </div>
          <pre className="p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all bg-card max-h-72 overflow-y-auto">
            {prettyJson(resp.text)}
          </pre>
        </div>
      )}
    </div>
  );
}

function EndpointRow({
  ep,
  baseUrl,
  apiKey,
  setApiKey,
}: {
  ep: EndpointDoc;
  baseUrl: string;
  apiKey: string;
  setApiKey: (v: string) => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"curl" | "try">("curl");
  const [copied, setCopied] = useState(false);

  const copyEndpoint = async () => {
    const text = `${ep.method} ${baseUrl}${ep.path}\n\n${ep.curl}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback untuk browser tanpa akses clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* abaikan */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
        >
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 w-[52px] text-center ${methodStyle[ep.method]}`}
          >
            {ep.method}
          </span>
          <code className="text-xs font-mono text-foreground truncate flex-1">{ep.path}</code>
          <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[220px]">{ep.title}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <div className="pr-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={copyEndpoint}
            title={t("apiDocs.copyEndpointTitle")}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? t("apiDocs.copied") : t("apiDocs.copy")}
          </Button>
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border bg-card">
          <p className="text-sm font-medium text-foreground pt-2">{ep.title}</p>
          {ep.note && (
            <p className="text-xs text-muted-foreground flex gap-1.5 items-start">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {ep.note}
            </p>
          )}
          {ep.params && ep.params.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-secondary/60 text-left">
                    <th className="px-3 py-1.5 font-semibold">{t("apiDocs.colParam")}</th>
                    <th className="px-3 py-1.5 font-semibold">{t("apiDocs.colType")}</th>
                    <th className="px-3 py-1.5 font-semibold">{t("apiDocs.colRequired")}</th>
                    <th className="px-3 py-1.5 font-semibold">{t("apiDocs.colDesc")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ep.params.map((p) => (
                    <tr key={p.name} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">{p.name}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.type}</td>
                      <td className="px-3 py-1.5">
                        {p.required ? (
                          <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">{t("apiDocs.requiredYes")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-1 border-b border-border">
            {(["curl", "try"] as const).map((tb) => (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  tab === tb
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tb === "curl" ? t("apiDocs.tabCurl") : t("apiDocs.tabTry")}
              </button>
            ))}
          </div>
          {tab === "curl" ? (
            <CurlBlock title={t("apiDocs.curlExampleTitle").replace("{title}", ep.title)} code={ep.curl} />
          ) : (
            <TryIt ep={ep} baseUrl={baseUrl} apiKey={apiKey} setApiKey={setApiKey} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Isi dokumentasi ────────────────────────────────── */

function DocsContent({ isPublic, embedded = false }: { isPublic: boolean; embedded?: boolean }) {
  const { t } = useLang();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const groups = useMemo(() => buildGroups(baseUrl, t), [baseUrl, t]);
  const [tryKey, setTryKey] = useState(() => {
    try {
      return localStorage.getItem("wag_try_apikey") || "";
    } catch {
      return "";
    }
  });
  const [showTryKey, setShowTryKey] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("wag_try_apikey", tryKey);
    } catch {
      /* abaikan */
    }
  }, [tryKey]);

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="w-5 h-5" /> {t("apiDocs.pageTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("apiDocs.pageSubtitle")}
          </p>
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> {t("apiDocs.authTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("apiDocs.authDescIntro")}{" "}
            <code className="font-mono text-foreground bg-secondary px-1 rounded">X-API-Key</code>.
            {isPublic ? (
              <>
                {" "}{t("apiDocs.authNoKey")}{" "}<Link href="/register" className="text-primary underline">{t("apiDocs.authRegisterLink")}</Link>{t("apiDocs.authNoKeyAfter")}
              </>
            ) : (
              <>{t("apiDocs.authHasKeyBefore")}{" "}<Link href="/settings" className="text-primary underline">{t("apiDocs.authSettingsLink")}</Link>.</>
            )}
          </p>
          <CurlBlock
            title={t("apiDocs.curlAuthExampleTitle")}
            code={`curl -X GET \\\n  ${baseUrl}/api/devices \\\n  -H "X-API-Key: YOUR_API_KEY"`}
          />
          <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
            {t("apiDocs.authNote")}
          </div>
        </CardContent>
      </Card>

      <Card id="docs-try">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" /> {t("apiDocs.tabTry")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="text-xs">{t("apiDocs.tryPageLabel")}</label>
          <div className="relative">
            <Input
              type={showTryKey ? "text" : "password"}
              value={tryKey}
              onChange={(e) => setTryKey(e.target.value)}
              placeholder={t("apiDocs.tryPagePlaceholder")}
              className="pr-10 font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowTryKey((v) => !v)}
              aria-label={showTryKey ? t("apiDocs.tryPageHideKey") : t("apiDocs.tryPageShowKey")}
            >
              {showTryKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("apiDocs.tryPageHint")}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{g.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{g.desc}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.endpoints.map((ep) => (
                <EndpointRow
                  key={`${ep.method}-${ep.path}`}
                  ep={ep}
                  baseUrl={baseUrl}
                  apiKey={tryKey}
                  setApiKey={setTryKey}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("apiDocs.webhookVerifyTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("apiDocs.whVerifyDesc1")}{" "}
            <code className="font-mono">X-Wagataway-Signature</code> {t("apiDocs.whVerifyDesc2")}
            HMAC-SHA256 {t("apiDocs.whVerifyDesc3")} <em>raw JSON body</em> ({t("apiDocs.whVerifyDesc4")}{" "}
            <code className="font-mono">sha256=&lt;hex&gt;</code>) {t("apiDocs.whVerifyDesc5")}{" "}
            <code className="font-mono">X-Wagataway-Timestamp</code> (unix
            epoch, {t("apiDocs.whVerifyDesc6")}). {t("apiDocs.whVerifyDesc7")}
          </p>
        </CardHeader>
        <CardContent>
          <CurlBlock
            title={t("apiDocs.nodeExampleTitle")}
            code={`const crypto = require("crypto");

function verifyWagatawaySignature(secret, rawBody, signature, timestamp) {
  // Tolak request yang terlalu lama (anti-replay, toleransi 5 menit)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Di handler webhook (Express):
app.post("/hook/wa", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyWagatawaySignature(
    process.env.WAGATAWAY_WEBHOOK_SECRET, // secret dari modal Ubah Perangkat
    req.body,                             // raw body, JANGAN JSON.parse dulu
    req.headers["x-wagataway-signature"],
    req.headers["x-wagataway-timestamp"]
  );
  if (!ok) return res.status(401).send("signature tidak valid");
  const payload = JSON.parse(req.body.toString());
  // ... proses payload.event / payload.payload
  res.sendStatus(200);
});`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("apiDocs.errorTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {[
                  { code: "400", desc: t("apiDocs.err400") },
                  { code: "401", desc: t("apiDocs.err401") },
                  { code: "403", desc: t("apiDocs.err403") },
                  { code: "404", desc: t("apiDocs.err404") },
                  { code: "422", desc: t("apiDocs.err422") },
                  { code: "429", desc: t("apiDocs.err429") },
                  { code: "500", desc: t("apiDocs.err500") },
                ].map((e) => (
                  <tr key={e.code} className="border-t border-border first:border-t-0">
                    <td className="px-3 py-2 font-mono font-bold w-16">{e.code}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center pb-4 flex items-center justify-center gap-1">
        <Check className="w-3 h-3" /> {t("apiDocs.baseUrlLabel")} <code className="font-mono">{baseUrl}/api</code>
      </p>
    </div>
  );
}

function PublicHeader() {
  const { t } = useLang();
  return (
    <header className="border-b border-border bg-card/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight">WaGataway</span>
          <Badge variant="secondary" className="text-[10px]">{t("apiDocs.pageTitle")}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">{t("apiDocs.loginBtn")}</Button>
          </Link>
          <Link href="/register">
            <Button size="sm">{t("apiDocs.registerBtn")}</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function ApiDocs({ embedded = false }: { embedded?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    if (embedded) {
      return <DocsContent isPublic={false} embedded />;
    }
    return (
      <DashboardLayout>
        <DocsContent isPublic={false} />
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <DocsContent isPublic={true} />
      </main>
    </div>
  );
}
