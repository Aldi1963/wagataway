import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Send,
  Smartphone,
  Loader2,
  FileText,
  Paperclip,
  X,
  Plus,
  Trash2,
  BarChart3,
  MousePointerClick,
  Sticker as StickerIcon,
  Mic,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useActiveDevice } from "@/hooks/use-active-device";
import FilePickerModal, { type PickedFile } from "@/components/FilePickerModal";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
}

interface Template {
  id: number;
  name: string;
  category: string;
  content: string;
}

type MsgType =
  | "text"
  | "poll"
  | "interactive"
  | "sticker"
  | "voicenote"
  | "location";

const TYPE_ICON: Record<MsgType, typeof Send> = {
  text: Send,
  poll: BarChart3,
  interactive: MousePointerClick,
  sticker: StickerIcon,
  voicenote: Mic,
  location: MapPin,
};

export default function SendMessage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [, navigate] = useLocation();
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [msgType, setMsgType] = useState<MsgType>("text");

  const MSG_TYPE_OPTIONS = [
    { value: "text", label: t("sendMessage.typeText") },
    { value: "poll", label: t("sendMessage.typePoll") },
    { value: "interactive", label: t("sendMessage.typeInteractive") },
    { value: "sticker", label: t("sendMessage.typeSticker") },
    { value: "voicenote", label: t("sendMessage.typeVoicenote") },
    { value: "location", label: t("sendMessage.typeLocation") },
  ];

  // --- tipe teks (perilaku lama, jangan diubah) ---
  const [content, setContent] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // --- polling ---
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);

  // --- tombol interaktif ---
  const [btnBody, setBtnBody] = useState("");
  const [btnFooter, setBtnFooter] = useState("");
  const [buttons, setButtons] = useState<{ id: string; title: string }[]>([
    { id: "", title: "" },
  ]);

  // --- stiker / voice note ---
  const [mediaUrl, setMediaUrl] = useState("");

  // --- lokasi ---
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locName, setLocName] = useState("");
  const [locAddress, setLocAddress] = useState("");
  const [locLive, setLocLive] = useState(false);

  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, tpl] = await Promise.all([
          apiGet<{ devices: Device[] }>("/devices"),
          apiGet<{ templates: Template[] }>("/templates"),
        ]);
        setDevices(d.devices ?? []);
        setTemplates(tpl.templates ?? []);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("sendMessage.loadFailed")
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((x) => x.id === Number(id));
    if (tpl) setContent(tpl.content);
  };

  const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
  const validButtons = buttons.filter(
    (b) => b.id.trim() !== "" && b.title.trim() !== ""
  );
  const latNum = parseFloat(lat.replace(",", "."));
  const lngNum = parseFloat(lng.replace(",", "."));
  const validLocation =
    to.trim() !== "" &&
    !isNaN(latNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    !isNaN(lngNum) &&
    lngNum >= -180 &&
    lngNum <= 180;

  const canSend =
    !sending &&
    activeDeviceId != null &&
    to.trim() !== "" &&
    (msgType === "text"
      ? content.trim() !== ""
      : msgType === "poll"
        ? pollQuestion.trim() !== "" && validOptions.length >= 2
        : msgType === "interactive"
          ? btnBody.trim() !== "" && validButtons.length >= 1
          : msgType === "sticker" || msgType === "voicenote"
            ? mediaUrl.trim() !== ""
            : validLocation);

  const resetTypeFields = () => {
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollMultiple(false);
    setBtnBody("");
    setBtnFooter("");
    setButtons([{ id: "", title: "" }]);
    setMediaUrl("");
    setLat("");
    setLng("");
    setLocName("");
    setLocAddress("");
    setLocLive(false);
  };

  const handleTypeChange = (v: string) => {
    setMsgType(v as MsgType);
    resetTypeFields();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend || activeDeviceId == null) return;

    // Validasi ringan per tipe
    if (msgType === "poll" && validOptions.length < 2) {
      toast.error(t("sendMessage.pollMin2"));
      return;
    }
    if (msgType === "poll" && validOptions.length > 12) {
      toast.error(t("sendMessage.pollMax12"));
      return;
    }
    if (msgType === "interactive" && validButtons.length === 0) {
      toast.error(t("sendMessage.buttonMin1"));
      return;
    }
    if (msgType === "location" && !validLocation) {
      toast.error(t("sendMessage.locationInvalid"));
      return;
    }

    setSending(true);
    try {
      const base = { deviceId: activeDeviceId, to: to.trim() };
      let endpoint = "/messages/send";
      let body: Record<string, unknown> = base;
      let okMsg = t("sendMessage.sentMessage");

      switch (msgType) {
        case "text": {
          // perilaku lama — jangan diubah
          body = { ...base, content: content.trim() };
          if (pickedFile) {
            const mime = pickedFile.mime ?? "";
            body.type = mime.startsWith("image/")
              ? "image"
              : mime.startsWith("video/")
                ? "video"
                : mime.startsWith("audio/")
                  ? "audio"
                  : "document";
            body.fileId = pickedFile.id;
          } else {
            body.type = "text";
          }
          break;
        }
        case "poll":
          endpoint = "/messages/send-poll";
          body = {
            ...base,
            question: pollQuestion.trim(),
            options: validOptions,
            allowMultiple: pollMultiple,
          };
          okMsg = t("sendMessage.pollSent");
          break;
        case "interactive":
          endpoint = "/messages/send-interactive";
          body = {
            ...base,
            body: btnBody.trim(),
            buttons: validButtons.map((b) => ({
              id: b.id.trim(),
              title: b.title.trim(),
            })),
            footer: btnFooter.trim() || undefined,
          };
          okMsg = t("sendMessage.interactiveSent");
          break;
        case "sticker":
          endpoint = "/messages/send-sticker";
          body = { ...base, mediaUrl: mediaUrl.trim() };
          okMsg = t("sendMessage.stickerSent");
          break;
        case "voicenote":
          endpoint = "/messages/send-voice-note";
          body = { ...base, mediaUrl: mediaUrl.trim() };
          okMsg = t("sendMessage.voicenoteSent");
          break;
        case "location":
          endpoint = "/messages/send-location";
          body = {
            ...base,
            latitude: latNum,
            longitude: lngNum,
            name: locName.trim() || undefined,
            address: locAddress.trim() || undefined,
            live: locLive,
          };
          okMsg = t("sendMessage.locationSent");
          break;
      }

      await apiPost(endpoint, body);
      toast.success(okMsg);
      setTo("");
      setContent("");
      setTemplateId("");
      setPickedFile(null);
      resetTypeFields();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sendMessage.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const TypeIcon = TYPE_ICON[msgType];

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        {!embedded && (
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("sendMessage.cardTitle")}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-9 rounded-md bg-muted" />
              <div className="h-9 rounded-md bg-muted" />
              <div className="h-28 rounded-md bg-muted" />
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Smartphone className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {t("sendMessage.noDevicesTitle")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("sendMessage.noDevicesHint")}
                </p>
              </div>
              <Button size="sm" onClick={() => navigate("/")}>
                {t("sendMessage.goDashboard")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              {activeDeviceId == null ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                  {t("sendMessage.selectDeviceFirst")}
                </div>
              ) : (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {t("sendMessage.sendingVia")}{" "}
                  <span className="font-medium text-foreground">
                    {activeDevice?.name || `Perangkat #${activeDeviceId}`}
                  </span>
                </p>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  {t("sendMessage.labelTo")}
                </label>
                <Input
                  placeholder="628xxxxxxxxxx"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="font-mono"
                  disabled={sending}
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  {t("sendMessage.formatHint")}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  {t("sendMessage.labelType")}
                </label>
                <Dropdown
                  value={msgType}
                  onChange={handleTypeChange}
                  ariaLabel={t("sendMessage.ariaType")}
                  disabled={sending}
                  options={MSG_TYPE_OPTIONS}
                />
              </div>

              {msgType === "text" && (
                <>
                  {templates.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        {t("sendMessage.labelTemplate")} <span className="text-muted-foreground">{t("sendMessage.optional")}</span>
                      </label>
                      <Dropdown
                        value={templateId}
                        onChange={handleTemplate}
                        ariaLabel={t("sendMessage.ariaTemplate")}
                        disabled={sending}
                        options={[
                          { value: "", label: t("sendMessage.noTemplate") },
                          ...templates.map((tpl) => ({ value: String(tpl.id), label: tpl.name })),
                        ]}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelMessage")}
                    </label>
                    <textarea
                      className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[120px] resize-y disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder={t("sendMessage.messagePlaceholder")}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      disabled={sending}
                      required
                    />
                    <p className="text-[10px] text-muted-foreground text-right">
                      {t("sendMessage.charCount").replace("{n}", String(content.length))}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelAttachment")} <span className="text-muted-foreground">{t("sendMessage.optional")}</span>
                    </label>
                    {pickedFile ? (
                      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                        <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {pickedFile.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPickedFile(null)}
                          aria-label={t("sendMessage.removeAttachment")}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setPickerOpen(true)}
                        disabled={sending}
                      >
                        <Paperclip className="w-4 h-4" />
                        {t("sendMessage.pickFromFileManager")}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {msgType === "poll" && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelQuestion")}
                    </label>
                    <Input
                      placeholder="Mis. Kapan kita meeting?"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      disabled={sending}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelOptions")}{" "}
                      <span className="text-muted-foreground">
                        ({t("sendMessage.optionsHint").replace("{n}", String(validOptions.length))})
                      </span>
                    </label>
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            placeholder={t("sendMessage.optionPlaceholder").replace("{i}", String(i + 1))}
                            value={opt}
                            onChange={(e) =>
                              setPollOptions(
                                pollOptions.map((o, x) =>
                                  x === i ? e.target.value : o
                                )
                              )
                            }
                            disabled={sending}
                            className="min-w-0 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              pollOptions.length > 2 &&
                              setPollOptions(
                                pollOptions.filter((_, x) => x !== i)
                              )
                            }
                            disabled={sending || pollOptions.length <= 2}
                            aria-label={t("sendMessage.removeOption").replace("{i}", String(i + 1))}
                            className="p-2 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {pollOptions.length < 12 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() =>
                          setPollOptions([...pollOptions, ""])
                        }
                        disabled={sending}
                      >
                        <Plus className="w-4 h-4" />
                        {t("sendMessage.addOption")}
                      </Button>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pollMultiple}
                      onChange={(e) => setPollMultiple(e.target.checked)}
                      disabled={sending}
                      className="h-4 w-4 rounded border-border accent-[#243370]"
                    />
                    {t("sendMessage.allowMultiple")}
                  </label>
                </>
              )}

              {msgType === "interactive" && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelInteractiveBody")}
                    </label>
                    <textarea
                      className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[100px] resize-y disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder={t("sendMessage.interactiveBodyPlaceholder")}
                      value={btnBody}
                      onChange={(e) => setBtnBody(e.target.value)}
                      disabled={sending}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelButtons")}{" "}
                      <span className="text-muted-foreground">
                        ({t("sendMessage.buttonsHint").replace("{n}", String(validButtons.length))})
                      </span>
                    </label>
                    <div className="space-y-2">
                      {buttons.map((b, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
                        >
                          <Input
                            placeholder={t("sendMessage.buttonIdPlaceholder")}
                            value={b.id}
                            onChange={(e) =>
                              setButtons(
                                buttons.map((x, xi) =>
                                  xi === i ? { ...x, id: e.target.value } : x
                                )
                              )
                            }
                            disabled={sending}
                            className="min-w-0 flex-1 basis-28 font-mono text-xs"
                          />
                          <Input
                            placeholder={t("sendMessage.buttonLabelPlaceholder")}
                            value={b.title}
                            onChange={(e) =>
                              setButtons(
                                buttons.map((x, xi) =>
                                  xi === i ? { ...x, title: e.target.value } : x
                                )
                              )
                            }
                            disabled={sending}
                            className="min-w-0 flex-[2] basis-36 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              buttons.length > 1 &&
                              setButtons(buttons.filter((_, x) => x !== i))
                            }
                            disabled={sending || buttons.length <= 1}
                            aria-label={t("sendMessage.removeButton").replace("{i}", String(i + 1))}
                            className="p-2 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {buttons.length < 3 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() =>
                          setButtons([...buttons, { id: "", title: "" }])
                        }
                        disabled={sending}
                      >
                        <Plus className="w-4 h-4" />
                        {t("sendMessage.addButton")}
                      </Button>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {t("sendMessage.buttonsHelpText")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelFooter")}{" "}
                      <span className="text-muted-foreground">{t("sendMessage.optional")}</span>
                    </label>
                    <Input
                      placeholder={t("sendMessage.footerPlaceholder")}
                      value={btnFooter}
                      onChange={(e) => setBtnFooter(e.target.value)}
                      disabled={sending}
                    />
                  </div>
                </>
              )}

              {(msgType === "sticker" || msgType === "voicenote") && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">
                    {t("sendMessage.labelMediaUrl")}
                  </label>
                  <Input
                    placeholder={
                      msgType === "sticker"
                        ? "https://contoh.com/stiker.webp"
                        : "https://contoh.com/audio.ogg"
                    }
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    className="font-mono text-xs"
                    disabled={sending}
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {msgType === "sticker"
                      ? t("sendMessage.stickerHint")
                      : t("sendMessage.voicenoteHint")}
                  </p>
                </div>
              )}

              {msgType === "location" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        {t("sendMessage.labelLatitude")}
                      </label>
                      <Input
                        placeholder="-6.2"
                        inputMode="decimal"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        className="font-mono"
                        disabled={sending}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        {t("sendMessage.labelLongitude")}
                      </label>
                      <Input
                        placeholder="106.8"
                        inputMode="decimal"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        className="font-mono"
                        disabled={sending}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelPlaceName")}{" "}
                      <span className="text-muted-foreground">{t("sendMessage.optional")}</span>
                    </label>
                    <Input
                      placeholder="Mis. Kantor Clipku"
                      value={locName}
                      onChange={(e) => setLocName(e.target.value)}
                      disabled={sending}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      {t("sendMessage.labelAddress")}{" "}
                      <span className="text-muted-foreground">{t("sendMessage.optional")}</span>
                    </label>
                    <Input
                      placeholder="Jl. Contoh No. 1"
                      value={locAddress}
                      onChange={(e) => setLocAddress(e.target.value)}
                      disabled={sending}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={locLive}
                      onChange={(e) => setLocLive(e.target.checked)}
                      disabled={sending}
                      className="h-4 w-4 rounded border-border accent-[#243370]"
                    />
                    {t("sendMessage.liveLocation")}
                  </label>
                </>
              )}

              <Button type="submit" className="gap-2" disabled={!canSend}>
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <TypeIcon className="w-4 h-4" />
                )}
                {sending ? t("sendMessage.sending") : t("sendMessage.sendButton")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>


      {msgType === "text" && templates.length === 0 && !loading && devices.length > 0 && (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          {t("sendMessage.noTemplatesPrefix")}{" "}
          <Link to="/templates" className="underline underline-offset-2">
            {t("sendMessage.createTemplate")}
          </Link>{" "}
          {t("sendMessage.noTemplatesSuffix")}
        </p>
      )}

      <FilePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(f) => setPickedFile(f)}
      />
    </div>
  );
}
