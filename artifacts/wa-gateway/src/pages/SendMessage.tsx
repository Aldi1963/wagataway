import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Send, Loader2, CheckCircle2, Image, List, MousePointerClick, BarChart2, FileText, MessageSquare, ExternalLink, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";

function DeviceSelect({ value, onChange, devices }: { value: string; onChange: (v: string) => void; devices: any[] }) {
  const connected = devices.filter((d) => d.status === "connected");
  return (
    <div className="space-y-2">
      <Label>Perangkat</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Pilih perangkat WhatsApp" />
        </SelectTrigger>
        <SelectContent>
          {!connected.length ? (
            <SelectItem value="_none" disabled>Tidak ada perangkat terhubung</SelectItem>
          ) : connected.map((d: any) => (
            <SelectItem key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>Nomor Tujuan</Label>
      <Input placeholder="628123456789" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="text-xs text-muted-foreground">Format: 628xxx (tanpa +, spasi, atau tanda hubung)</p>
    </div>
  );
}

function SendButton({ isPending, sent, label = "Kirim" }: { isPending: boolean; sent: boolean; label?: string }) {
  return (
    <Button type="submit" className="w-full gap-2" disabled={isPending}>
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
      {isPending ? "Mengirim..." : sent ? "Terkirim!" : label}
    </Button>
  );
}

export default function SendMessage() {
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [limitErr, setLimitErr] = useState<{ message: string; current?: number; limit?: number; planName?: string } | null>(null);
  const [activeTab, setActiveTab] = useState("text");

  const [common, setCommon] = useState({ deviceId: "", phone: "" });

  const [textMsg, setTextMsg] = useState({ message: "" });

  const [buttonMsg, setButtonMsg] = useState({
    body: "", footer: "",
    buttons: [{ id: "btn1", displayText: "" }, { id: "btn2", displayText: "" }, { id: "btn3", displayText: "" }],
  });

  const [listMsg, setListMsg] = useState({
    title: "", body: "", footer: "", buttonText: "Pilih",
    sections: [{ title: "Pilihan", rows: [{ id: "row1", title: "", description: "" }] }],
  });

  const [mediaMsg, setMediaMsg] = useState({ mediaType: "image", url: "", caption: "" });

  const [pollMsg, setPollMsg] = useState({
    name: "", options: ["", "", ""], allowMultipleAnswers: false,
  });

  const [templateMsg, setTemplateMsg] = useState<{ selectedId: string; varValues: Record<string, string> }>({
    selectedId: "", varValues: {},
  });

  const qc = useQueryClient();

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const { data: dbTemplates = [] } = useQuery<any[]>({
    queryKey: ["templates"],
    queryFn: () => apiFetch("/templates").then((r) => r.json()),
  });

  const selectedTemplate = dbTemplates.find((t) => t.id === templateMsg.selectedId) ?? null;
  const detectedVars: string[] = selectedTemplate?.variables ?? [];

  function buildTemplateMessage(): string {
    if (!selectedTemplate) return "";
    let msg = selectedTemplate.content as string;
    for (const [k, v] of Object.entries(templateMsg.varValues)) {
      msg = msg.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v || `{{${k}}}`);
    }
    return msg;
  }

  const sendMessage = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiFetch("/messages/send", { method: "POST", body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { const err = Object.assign(new Error(data.message ?? "Error"), data); throw err; }
      return data;
    },
    onSuccess: () => {
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      toast({ title: "Pesan berhasil dikirim" });
      // Increment template usage counter
      if (activeTab === "template" && templateMsg.selectedId) {
        apiFetch(`/templates/${templateMsg.selectedId}/use`, { method: "POST" })
          .then(() => qc.invalidateQueries({ queryKey: ["templates"] }))
          .catch(() => {});
      }
    },
    onError: (err: any) => {
      if (err?.code === "LIMIT_EXCEEDED") setLimitErr({ message: err.message, current: err.current, limit: err.limit, planName: err.planName });
      else toast({ title: "Gagal mengirim pesan", variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!common.deviceId || !common.phone) {
      toast({ title: "Pilih perangkat dan masukkan nomor tujuan", variant: "destructive" }); return;
    }

    let payload: any = { deviceId: common.deviceId, phone: common.phone, messageType: activeTab };

    if (activeTab === "text") {
      if (!textMsg.message) { toast({ title: "Pesan tidak boleh kosong", variant: "destructive" }); return; }
      payload.message = textMsg.message;
    } else if (activeTab === "button") {
      if (!buttonMsg.body) { toast({ title: "Isi pesan tidak boleh kosong", variant: "destructive" }); return; }
      payload.message = buttonMsg.body;
      payload.extra = { footer: buttonMsg.footer, buttons: buttonMsg.buttons.filter((b) => b.displayText) };
    } else if (activeTab === "list") {
      if (!listMsg.body) { toast({ title: "Isi pesan tidak boleh kosong", variant: "destructive" }); return; }
      payload.message = listMsg.body;
      payload.extra = { title: listMsg.title, footer: listMsg.footer, buttonText: listMsg.buttonText, sections: listMsg.sections };
    } else if (activeTab === "media") {
      if (!mediaMsg.url) { toast({ title: "URL media tidak boleh kosong", variant: "destructive" }); return; }
      payload.message = mediaMsg.caption || mediaMsg.url;
      payload.mediaUrl = mediaMsg.url;
      payload.extra = { mediaType: mediaMsg.mediaType, caption: mediaMsg.caption };
    } else if (activeTab === "poll") {
      if (!pollMsg.name) { toast({ title: "Pertanyaan polling tidak boleh kosong", variant: "destructive" }); return; }
      payload.message = pollMsg.name;
      payload.extra = { options: pollMsg.options.filter(Boolean), allowMultipleAnswers: pollMsg.allowMultipleAnswers };
    } else if (activeTab === "template") {
      if (!selectedTemplate) { toast({ title: "Pilih template terlebih dahulu", variant: "destructive" }); return; }
      payload.message = buildTemplateMessage();
      payload.messageType = "text";
    }

    sendMessage.mutate(payload);
  }

  const allDevices = devices ?? [];

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <DeviceSelect value={common.deviceId} onChange={(v) => setCommon((c) => ({ ...c, deviceId: v }))} devices={allDevices} />
            <PhoneInput value={common.phone} onChange={(v) => setCommon((c) => ({ ...c, phone: v }))} />

            <div>
              <Label className="mb-2 block">Jenis Pesan</Label>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto gap-1">
                  <TabsTrigger value="text" className="flex flex-col gap-1 h-14 text-xs">
                    <MessageSquare className="w-4 h-4" /> Teks
                  </TabsTrigger>
                  <TabsTrigger value="button" className="flex flex-col gap-1 h-14 text-xs">
                    <MousePointerClick className="w-4 h-4" /> Tombol
                  </TabsTrigger>
                  <TabsTrigger value="list" className="flex flex-col gap-1 h-14 text-xs">
                    <List className="w-4 h-4" /> List
                  </TabsTrigger>
                  <TabsTrigger value="media" className="flex flex-col gap-1 h-14 text-xs">
                    <Image className="w-4 h-4" /> Media
                  </TabsTrigger>
                  <TabsTrigger value="poll" className="flex flex-col gap-1 h-14 text-xs">
                    <BarChart2 className="w-4 h-4" /> Polling
                  </TabsTrigger>
                  <TabsTrigger value="template" className="flex flex-col gap-1 h-14 text-xs">
                    <FileText className="w-4 h-4" /> Template
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Pesan</Label>
                      <span className="text-xs text-muted-foreground">{textMsg.message.length} karakter</span>
                    </div>
                    <Textarea
                      placeholder="Ketik pesan di sini..."
                      rows={5}
                      value={textMsg.message}
                      onChange={(e) => setTextMsg({ message: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Gunakan *bold*, _italic_, ~strikethrough~ untuk format teks</p>
                  </div>
                </TabsContent>

                <TabsContent value="button" className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Isi Pesan</Label>
                    <Textarea
                      placeholder="Pilih layanan yang Anda butuhkan:"
                      rows={3}
                      value={buttonMsg.body}
                      onChange={(e) => setButtonMsg((b) => ({ ...b, body: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer (Opsional)</Label>
                    <Input
                      placeholder="WA Gateway"
                      value={buttonMsg.footer}
                      onChange={(e) => setButtonMsg((b) => ({ ...b, footer: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tombol (maks. 3)</Label>
                    {buttonMsg.buttons.map((btn, i) => (
                      <Input
                        key={i}
                        placeholder={`Tombol ${i + 1}`}
                        value={btn.displayText}
                        onChange={(e) => {
                          const btns = [...buttonMsg.buttons];
                          btns[i] = { ...btns[i], displayText: e.target.value };
                          setButtonMsg((b) => ({ ...b, buttons: btns }));
                        }}
                      />
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="list" className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Judul</Label>
                    <Input
                      placeholder="Menu Layanan"
                      value={listMsg.title}
                      onChange={(e) => setListMsg((l) => ({ ...l, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Isi Pesan</Label>
                    <Textarea
                      placeholder="Silakan pilih layanan yang Anda butuhkan dari menu di bawah:"
                      rows={3}
                      value={listMsg.body}
                      onChange={(e) => setListMsg((l) => ({ ...l, body: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Teks Tombol List</Label>
                    <Input
                      placeholder="Pilih Layanan"
                      value={listMsg.buttonText}
                      onChange={(e) => setListMsg((l) => ({ ...l, buttonText: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Item List</Label>
                    {listMsg.sections[0].rows.map((row, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder={`Item ${i + 1}`}
                          value={row.title}
                          onChange={(e) => {
                            const rows = [...listMsg.sections[0].rows];
                            rows[i] = { ...rows[i], title: e.target.value };
                            setListMsg((l) => ({ ...l, sections: [{ ...l.sections[0], rows }] }));
                          }}
                        />
                        <Input
                          placeholder="Deskripsi"
                          value={row.description}
                          onChange={(e) => {
                            const rows = [...listMsg.sections[0].rows];
                            rows[i] = { ...rows[i], description: e.target.value };
                            setListMsg((l) => ({ ...l, sections: [{ ...l.sections[0], rows }] }));
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setListMsg((l) => ({
                        ...l,
                        sections: [{ ...l.sections[0], rows: [...l.sections[0].rows, { id: `row${l.sections[0].rows.length + 1}`, title: "", description: "" }] }],
                      }))}
                    >
                      + Tambah Item
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="media" className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Jenis Media</Label>
                    <Select value={mediaMsg.mediaType} onValueChange={(v) => setMediaMsg((m) => ({ ...m, mediaType: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">🖼️ Gambar (JPG, PNG, WebP)</SelectItem>
                        <SelectItem value="video">🎬 Video (MP4)</SelectItem>
                        <SelectItem value="document">📄 Dokumen (PDF, DOCX)</SelectItem>
                        <SelectItem value="audio">🎵 Audio (MP3, OGG)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>URL Media</Label>
                    <Input
                      placeholder="https://example.com/image.jpg"
                      value={mediaMsg.url}
                      onChange={(e) => setMediaMsg((m) => ({ ...m, url: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Masukkan URL publik file media yang akan dikirim</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Caption (Opsional)</Label>
                    <Textarea
                      placeholder="Keterangan media..."
                      rows={3}
                      value={mediaMsg.caption}
                      onChange={(e) => setMediaMsg((m) => ({ ...m, caption: e.target.value }))}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="poll" className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Pertanyaan Polling</Label>
                    <Input
                      placeholder="Produk mana yang Anda sukai?"
                      value={pollMsg.name}
                      onChange={(e) => setPollMsg((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pilihan Jawaban (min. 2)</Label>
                    {pollMsg.options.map((opt, i) => (
                      <Input
                        key={i}
                        placeholder={`Pilihan ${i + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const opts = [...pollMsg.options];
                          opts[i] = e.target.value;
                          setPollMsg((p) => ({ ...p, options: opts }));
                        }}
                      />
                    ))}
                    {pollMsg.options.length < 12 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPollMsg((p) => ({ ...p, options: [...p.options, ""] }))}
                      >
                        + Tambah Pilihan
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                    <input
                      type="checkbox"
                      id="multi"
                      checked={pollMsg.allowMultipleAnswers}
                      onChange={(e) => setPollMsg((p) => ({ ...p, allowMultipleAnswers: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <label htmlFor="multi" className="text-sm cursor-pointer">Izinkan jawaban ganda</label>
                  </div>
                </TabsContent>

                <TabsContent value="template" className="mt-4 space-y-3">
                  {dbTemplates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
                      <FileText className="w-8 h-8" />
                      <p className="text-sm text-center">Belum ada template. Buat template dulu di halaman Template Pesan.</p>
                      <Link href="/templates">
                        <Button size="sm" variant="outline" className="gap-2">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Buka Template Pesan
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Pilih Template</Label>
                          <Link href="/templates">
                            <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs text-muted-foreground">
                              <ExternalLink className="w-3 h-3" />
                              Kelola
                            </Button>
                          </Link>
                        </div>
                        <Select
                          value={templateMsg.selectedId}
                          onValueChange={(v) => setTemplateMsg({ selectedId: v, varValues: {} })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="-- Pilih template --" />
                          </SelectTrigger>
                          <SelectContent>
                            {dbTemplates.map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                                {t.category && t.category !== "general" && (
                                  <span className="ml-2 text-xs text-muted-foreground">({t.category})</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedTemplate && detectedVars.length > 0 && (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" />
                            Isi Variabel
                          </Label>
                          <div className="space-y-2">
                            {detectedVars.map((v) => (
                              <div key={v} className="flex items-center gap-2">
                                <span className="text-xs font-mono bg-muted px-2 py-1 rounded w-24 shrink-0 text-center">{`{{${v}}}`}</span>
                                <Input
                                  placeholder={`Nilai untuk ${v}`}
                                  value={templateMsg.varValues[v] ?? ""}
                                  onChange={(e) => setTemplateMsg((prev) => ({
                                    ...prev,
                                    varValues: { ...prev.varValues, [v]: e.target.value },
                                  }))}
                                  className="text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedTemplate && (
                        <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Preview pesan:</p>
                          <p className="text-sm whitespace-pre-line font-mono leading-relaxed">{buildTemplateMessage()}</p>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <SendButton isPending={sendMessage.isPending} sent={sent} label="Kirim Pesan" />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2">Tips Penggunaan</p>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            <li>Pastikan nomor tujuan aktif di WhatsApp</li>
            <li>Pesan Tombol hanya bisa diterima di WhatsApp versi terbaru</li>
            <li>Polling tidak bisa dikirim ke grup, hanya kontak pribadi</li>
            <li>URL media harus dapat diakses secara publik</li>
          </ul>
        </CardContent>
      </Card>

      <LimitExceededDialog
        open={!!limitErr}
        onClose={() => setLimitErr(null)}
        message={limitErr?.message ?? ""}
        current={limitErr?.current}
        limit={limitErr?.limit}
        planName={limitErr?.planName}
        resource="Pesan"
      />
    </div>
  );
}
