import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Send,
  Smartphone,
  Loader2,
  History,
  Inbox,
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

interface Message {
  id: number;
  to: string;
  content: string;
  status: string;
  createdAt: string;
}

type MsgType =
  | "text"
  | "poll"
  | "interactive"
  | "sticker"
  | "voicenote"
  | "location";

const MSG_TYPE_OPTIONS = [
  { value: "text", label: "Teks / Media" },
  { value: "poll", label: "Polling" },
  { value: "interactive", label: "Tombol Interaktif" },
  { value: "sticker", label: "Stiker" },
  { value: "voicenote", label: "Voice Note" },
  { value: "location", label: "Lokasi" },
];

const TYPE_ICON: Record<MsgType, typeof Send> = {
  text: Send,
  poll: BarChart3,
  interactive: MousePointerClick,
  sticker: StickerIcon,
  voicenote: Mic,
  location: MapPin,
};

function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "baru saja";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return mins + " menit lalu";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " jam lalu";
  return Math.floor(hours / 24) + " hari lalu";
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  sent: "Terkirim",
  delivered: "Terkirim",
  read: "Dibaca",
  failed: "Gagal",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const cls =
    status === "failed"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : status === "pending"
        ? "bg-muted text-muted-foreground"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export default function SendMessage({ embedded = false }: { embedded?: boolean }) {
  const [, navigate] = useLocation();
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [msgType, setMsgType] = useState<MsgType>("text");

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

  const loadHistory = async () => {
    try {
      const res = await apiGet<{ messages: Message[] }>("/messages");
      setHistory(res.messages ?? []);
    } catch {
      // riwayat gagal dimuat — biarkan kosong
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [d, t] = await Promise.all([
          apiGet<{ devices: Device[] }>("/devices"),
          apiGet<{ templates: Template[] }>("/templates"),
        ]);
        setDevices(d.devices ?? []);
        setTemplates(t.templates ?? []);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Gagal memuat data"
        );
      } finally {
        setLoading(false);
      }
      await loadHistory();
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
      toast.error("Polling butuh minimal 2 opsi");
      return;
    }
    if (msgType === "poll" && validOptions.length > 12) {
      toast.error("Polling maksimal 12 opsi");
      return;
    }
    if (msgType === "interactive" && validButtons.length === 0) {
      toast.error("Isi minimal 1 tombol (ID + label)");
      return;
    }
    if (msgType === "location" && !validLocation) {
      toast.error("Latitude (-90..90) dan longitude (-180..180) tidak valid");
      return;
    }

    setSending(true);
    try {
      const base = { deviceId: activeDeviceId, to: to.trim() };
      let endpoint = "/messages/send";
      let body: Record<string, unknown> = base;
      let okMsg = "Pesan terkirim";

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
          okMsg = "Polling terkirim";
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
          okMsg = "Pesan interaktif terkirim";
          break;
        case "sticker":
          endpoint = "/messages/send-sticker";
          body = { ...base, mediaUrl: mediaUrl.trim() };
          okMsg = "Stiker terkirim";
          break;
        case "voicenote":
          endpoint = "/messages/send-voice-note";
          body = { ...base, mediaUrl: mediaUrl.trim() };
          okMsg = "Voice note terkirim";
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
          okMsg = "Lokasi terkirim";
          break;
      }

      await apiPost(endpoint, body);
      toast.success(okMsg);
      setTo("");
      setContent("");
      setTemplateId("");
      setPickedFile(null);
      resetTypeFields();
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim pesan");
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
            <CardTitle className="text-sm font-semibold">Kirim Pesan</CardTitle>
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
                  Belum ada perangkat
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tambahkan dan hubungkan perangkat WhatsApp dulu sebelum
                  mengirim pesan.
                </p>
              </div>
              <Button size="sm" onClick={() => navigate("/")}>
                Ke Dashboard
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              {activeDeviceId == null ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                  Pilih perangkat aktif di sidebar dulu sebelum mengirim pesan.
                </div>
              ) : (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Mengirim via{" "}
                  <span className="font-medium text-foreground">
                    {activeDevice?.name || `Perangkat #${activeDeviceId}`}
                  </span>
                </p>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Nomor Tujuan
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
                  Format: 628xxx (tanpa + atau 0)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Tipe Pesan
                </label>
                <Dropdown
                  value={msgType}
                  onChange={handleTypeChange}
                  ariaLabel="Tipe pesan"
                  disabled={sending}
                  options={MSG_TYPE_OPTIONS}
                />
              </div>

              {msgType === "text" && (
                <>
                  {templates.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        Template <span className="text-muted-foreground">(opsional)</span>
                      </label>
                      <Dropdown
                        value={templateId}
                        onChange={handleTemplate}
                        ariaLabel="Template"
                        disabled={sending}
                        options={[
                          { value: "", label: "Tanpa template" },
                          ...templates.map((t) => ({ value: String(t.id), label: t.name })),
                        ]}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Pesan
                    </label>
                    <textarea
                      className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[120px] resize-y disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Tulis pesan Anda..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      disabled={sending}
                      required
                    />
                    <p className="text-[10px] text-muted-foreground text-right">
                      {content.length} karakter
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Lampiran <span className="text-muted-foreground">(opsional)</span>
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
                          aria-label="Hapus lampiran"
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
                        Pilih dari File Manager
                      </Button>
                    )}
                  </div>
                </>
              )}

              {msgType === "poll" && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Pertanyaan
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
                      Opsi Jawaban{" "}
                      <span className="text-muted-foreground">
                        ({validOptions.length}/12, min 2)
                      </span>
                    </label>
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            placeholder={`Opsi ${i + 1}`}
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
                            aria-label={`Hapus opsi ${i + 1}`}
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
                        Tambah opsi
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
                    Boleh pilih lebih dari satu jawaban
                  </label>
                </>
              )}

              {msgType === "interactive" && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Isi Pesan
                    </label>
                    <textarea
                      className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[100px] resize-y disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Tulis isi pesan..."
                      value={btnBody}
                      onChange={(e) => setBtnBody(e.target.value)}
                      disabled={sending}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Tombol{" "}
                      <span className="text-muted-foreground">
                        ({validButtons.length}/3, min 1)
                      </span>
                    </label>
                    <div className="space-y-2">
                      {buttons.map((b, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
                        >
                          <Input
                            placeholder="ID tombol"
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
                            placeholder="Label tombol"
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
                            aria-label={`Hapus tombol ${i + 1}`}
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
                        Tambah tombol
                      </Button>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      ID dipakai untuk mengenali tombol yang ditekan penerima
                      (mis. "ya", "tidak").
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Footer{" "}
                      <span className="text-muted-foreground">(opsional)</span>
                    </label>
                    <Input
                      placeholder="Teks kecil di bawah tombol"
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
                    URL Media
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
                      ? "Link langsung ke file gambar .webp"
                      : "Link langsung ke file audio (ogg/opus, mp3)"}
                  </p>
                </div>
              )}

              {msgType === "location" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        Latitude
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
                        Longitude
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
                      Nama tempat{" "}
                      <span className="text-muted-foreground">(opsional)</span>
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
                      Alamat{" "}
                      <span className="text-muted-foreground">(opsional)</span>
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
                    Lokasi live (real-time)
                  </label>
                </>
              )}

              <Button type="submit" className="gap-2" disabled={!canSend}>
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <TypeIcon className="w-4 h-4" />
                )}
                {sending ? "Mengirim..." : "Kirim"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4" />
            Riwayat Pengiriman
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Belum ada pesan terkirim
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {history.slice(0, 10).map((m) => (
                <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium">
                      {m.to}
                    </span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {m.content}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {timeAgo(m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {msgType === "text" && templates.length === 0 && !loading && devices.length > 0 && (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          Belum ada template.{" "}
          <Link to="/templates" className="underline underline-offset-2">
            Buat template
          </Link>{" "}
          untuk pengiriman lebih cepat.
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
