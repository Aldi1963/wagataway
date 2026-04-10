import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Save, Loader2, Plus, Trash2, Eye,
  Type, BarChart2, MessageSquare, HelpCircle, Footprints,
  Zap, Phone, Mail, ToggleRight, ToggleLeft, ChevronDown, ChevronUp,
  ExternalLink, Search, Upload, Link2, ImageIcon, FileImage,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stat { label: string; value: string; }
interface Feature { icon: string; title: string; desc: string; }
interface Testimonial { name: string; role: string; company: string; text: string; avatar: string; }
interface FAQ { q: string; a: string; }
interface HowItWorks { step: string; title: string; desc: string; }

// ── Section Wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center gap-2.5 font-semibold text-sm">
          <Icon size={16} className="text-primary" /> {title}
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4 border-t border-border/40">{children}</div>}
    </div>
  );
}

// ── JSON Array Editor ─────────────────────────────────────────────────────────

function JsonEditor<T extends object>({
  value, onChange, renderItem, newItem, itemLabel,
}: {
  value: T[]; onChange: (v: T[]) => void;
  renderItem: (item: T, onChange: (updated: T) => void, onDelete: () => void) => React.ReactNode;
  newItem: T; itemLabel: string;
}) {
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="rounded-xl border border-border bg-muted/20 p-3">
          {renderItem(item, (updated) => { const arr = [...value]; arr[i] = updated; onChange(arr); }, () => onChange(value.filter((_, j) => j !== i)))}
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-2 text-xs w-full" onClick={() => onChange([...value, { ...newItem } as T])}>
        <Plus size={13} /> Tambah {itemLabel}
      </Button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminLandingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: raw, isLoading } = useQuery({
    queryKey: ["admin-landing-settings"],
    queryFn: () => apiFetch("/admin/landing-settings").then((r) => r.json()),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Stat[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [howItWorks, setHowItWorks] = useState<HowItWorks[]>([]);

  useEffect(() => {
    if (!raw) return;
    setForm(raw);
    try { setStats(JSON.parse(raw.landing_stats || "[]")); } catch { setStats([]); }
    try { setFeatures(JSON.parse(raw.landing_features || "[]")); } catch { setFeatures([]); }
    try { setTestimonials(JSON.parse(raw.landing_testimonials || "[]")); } catch { setTestimonials([]); }
    try { setFaqs(JSON.parse(raw.landing_faqs || "[]")); } catch { setFaqs([]); }
    try { setHowItWorks(JSON.parse(raw.landing_how_it_works || "[]")); } catch { setHowItWorks([]); }
  }, [raw]);

  const saveMutation = useMutation({
    mutationFn: () => apiFetch("/admin/landing-settings", {
      method: "PUT",
      body: JSON.stringify({
        ...form,
        landing_stats: JSON.stringify(stats),
        landing_features: JSON.stringify(features),
        landing_testimonials: JSON.stringify(testimonials),
        landing_faqs: JSON.stringify(faqs),
        landing_how_it_works: JSON.stringify(howItWorks),
      }),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-landing-settings"] });
      qc.invalidateQueries({ queryKey: ["landing"] });
      toast({ title: "Pengaturan landing page disimpan!" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  function setF(key: string, value: string) { setForm((prev) => ({ ...prev, [key]: value })); }
  function toggleBool(key: string) { setF(key, form[key] === "false" ? "true" : "false"); }

  const ICON_OPTIONS = ["Zap", "Bot", "MessageSquareText", "Repeat2", "BarChart2", "Smartphone", "Star", "Crown", "Shield", "CheckCircle2"];

  // File → base64 helper
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const faviconInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroImageInputRef = useRef<HTMLInputElement>(null);
  const ogImageInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2"><ExternalLink size={14} /> Preview</Button>
          </a>
          <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan Semua
          </Button>
        </div>
      </div>

      {/* ── Site Identity ── */}
      <Section title="Identitas Situs" icon={Globe}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nama Situs</Label>
            <Input value={form.site_name ?? ""} onChange={(e) => setF("site_name", e.target.value)} placeholder="WA Gateway" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Logo Website (Ikon/Emoji)</Label>
            <div className="flex gap-4 items-center">
              {/* Preview */}
              <div className="w-12 h-12 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {form.site_logo ? (
                  form.site_logo.startsWith("/") || form.site_logo.startsWith("http") ? (
                    <img src={form.site_logo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-2xl">{form.site_logo}</span>
                  )
                ) : (
                  <Globe size={24} className="text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Input value={form.site_logo ?? ""} onChange={(e) => setF("site_logo", e.target.value)} placeholder="⚡ atau URL gambar" className="flex-1" />
                  <input 
                    ref={logoInputRef} 
                    type="file" 
                    accept="image/*" 
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const formData = new FormData();
                      formData.append("image", file);
                      try {
                        const res = await apiFetch("/upload/image", { method: "POST", body: formData });
                        const data = await res.json();
                        if (data.url) {
                          setF("site_logo", data.url);
                          toast({ title: "Logo berhasil diupload" });
                        }
                      } catch (err) {
                        toast({ title: "Gagal upload logo", variant: "destructive" });
                      }
                    }} 
                  />
                  <Button variant="outline" size="sm" className="gap-2 h-10" onClick={() => logoInputRef.current?.click()}>
                    <Upload size={13} /> Upload Image
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Gunakan emoji atau upload file gambar sebagai logo sidebar.</p>
              </div>
            </div>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold">Tagline (badge di navbar)</Label>
            <Input value={form.site_tagline ?? ""} onChange={(e) => setF("site_tagline", e.target.value)} placeholder="Platform WhatsApp #1 di Indonesia" />
          </div>
        </div>
      </Section>

      {/* ── Hero ── */}
      <Section title="Hero Section" icon={Type}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Judul Utama (pisahkan baris dengan \\n)</Label>
            <Textarea value={form.hero_title ?? ""} onChange={(e) => setF("hero_title", e.target.value)}
              placeholder={"Kelola WhatsApp\nBisnis Anda\ndengan Mudah"} className="font-bold text-sm min-h-[80px] resize-none" />
            <p className="text-[11px] text-muted-foreground">Baris ke-2 akan tampil dengan warna hijau gradien</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Subtitle</Label>
            <Textarea value={form.hero_subtitle ?? ""} onChange={(e) => setF("hero_subtitle", e.target.value)}
              placeholder="Platform all-in-one untuk..." className="text-sm min-h-[70px] resize-none" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tombol CTA Utama</Label>
              <Input value={form.hero_cta1 ?? ""} onChange={(e) => setF("hero_cta1", e.target.value)} placeholder="Mulai Gratis Sekarang" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tombol CTA Kedua</Label>
              <Input value={form.hero_cta2 ?? ""} onChange={(e) => setF("hero_cta2", e.target.value)} placeholder="Masuk ke Dashboard" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Visibilitas Section ── */}
      <Section title="Tampilkan / Sembunyikan Section" icon={Eye}>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { key: "landing_show_stats", label: "Statistik" },
            { key: "landing_show_how_it_works", label: "Cara Kerja" },
            { key: "landing_show_pricing", label: "Harga / Paket" },
            { key: "landing_show_testimonials", label: "Testimoni" },
          ].map(({ key, label }) => {
            const on = form[key] !== "false";
            return (
              <button key={key} onClick={() => toggleBool(key)}
                className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left",
                  on ? "border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground hover:border-primary/30")}>
                {on ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
                {label}: {on ? "Tampil" : "Tersembunyi"}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Stats ── */}
      <Section title="Statistik (angka pencapaian)" icon={BarChart2} defaultOpen={false}>
        <JsonEditor
          value={stats} onChange={setStats}
          newItem={{ label: "Label Baru", value: "0+" }}
          itemLabel="Statistik"
          renderItem={(s, onChange, onDelete) => (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Nilai</Label>
                <Input value={s.value} onChange={(e) => onChange({ ...s, value: e.target.value })} placeholder="10.000+" className="h-8 text-sm" />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-[11px]">Label</Label>
                  <Input value={s.label} onChange={(e) => onChange({ ...s, label: e.target.value })} placeholder="Pengguna Aktif" className="h-8 text-sm" />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 size={13} /></Button>
              </div>
            </div>
          )}
        />
      </Section>

      {/* ── Features ── */}
      <Section title="Fitur Unggulan" icon={Zap} defaultOpen={false}>
        <JsonEditor
          value={features} onChange={setFeatures}
          newItem={{ icon: "Zap", title: "Fitur Baru", desc: "Deskripsi fitur..." }}
          itemLabel="Fitur"
          renderItem={(f, onChange, onDelete) => (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select value={f.icon} onChange={(e) => onChange({ ...f, icon: e.target.value })}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm flex-shrink-0">
                  {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <Input value={f.title} onChange={(e) => onChange({ ...f, title: e.target.value })} placeholder="Nama Fitur" className="h-8 text-sm flex-1" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0" onClick={onDelete}><Trash2 size={13} /></Button>
              </div>
              <Textarea value={f.desc} onChange={(e) => onChange({ ...f, desc: e.target.value })} placeholder="Deskripsi..." className="text-xs resize-none min-h-[56px]" />
            </div>
          )}
        />
      </Section>

      {/* ── How It Works ── */}
      <Section title="Cara Kerja (langkah-langkah)" icon={Footprints} defaultOpen={false}>
        <JsonEditor
          value={howItWorks} onChange={setHowItWorks}
          newItem={{ step: String(howItWorks.length + 1), title: "Langkah Baru", desc: "Deskripsi langkah..." }}
          itemLabel="Langkah"
          renderItem={(s, onChange, onDelete) => (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={s.step} onChange={(e) => onChange({ ...s, step: e.target.value })} placeholder="1" className="h-8 text-sm w-16 flex-shrink-0 text-center" />
                <Input value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} placeholder="Judul Langkah" className="h-8 text-sm flex-1" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0" onClick={onDelete}><Trash2 size={13} /></Button>
              </div>
              <Textarea value={s.desc} onChange={(e) => onChange({ ...s, desc: e.target.value })} placeholder="Deskripsi..." className="text-xs resize-none min-h-[56px]" />
            </div>
          )}
        />
      </Section>

      {/* ── Testimonials ── */}
      <Section title="Testimoni Pelanggan" icon={MessageSquare} defaultOpen={false}>
        <JsonEditor
          value={testimonials} onChange={setTestimonials}
          newItem={{ name: "Nama", role: "Jabatan", company: "Perusahaan", text: "Testimoni...", avatar: "" }}
          itemLabel="Testimoni"
          renderItem={(t, onChange, onDelete) => (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Input value={t.name} onChange={(e) => onChange({ ...t, name: e.target.value })} placeholder="Nama" className="h-8 text-sm" />
                <Input value={t.role} onChange={(e) => onChange({ ...t, role: e.target.value })} placeholder="Jabatan" className="h-8 text-sm" />
                <div className="flex gap-1.5">
                  <Input value={t.company} onChange={(e) => onChange({ ...t, company: e.target.value })} placeholder="Perusahaan" className="h-8 text-sm flex-1" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0" onClick={onDelete}><Trash2 size={13} /></Button>
                </div>
              </div>
              <Input value={t.avatar} onChange={(e) => onChange({ ...t, avatar: e.target.value })} placeholder="Inisial avatar (cth: BS)" className="h-8 text-sm" />
              <Textarea value={t.text} onChange={(e) => onChange({ ...t, text: e.target.value })} placeholder="Isi testimoni..." className="text-xs resize-none min-h-[60px]" />
            </div>
          )}
        />
      </Section>

      {/* ── FAQ ── */}
      <Section title="FAQ" icon={HelpCircle} defaultOpen={false}>
        <JsonEditor
          value={faqs} onChange={setFaqs}
          newItem={{ q: "Pertanyaan baru?", a: "Jawaban..." }}
          itemLabel="FAQ"
          renderItem={(f, onChange, onDelete) => (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={f.q} onChange={(e) => onChange({ ...f, q: e.target.value })} placeholder="Pertanyaan?" className="h-8 text-sm flex-1" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0" onClick={onDelete}><Trash2 size={13} /></Button>
              </div>
              <Textarea value={f.a} onChange={(e) => onChange({ ...f, a: e.target.value })} placeholder="Jawaban..." className="text-xs resize-none min-h-[60px]" />
            </div>
          )}
        />
      </Section>

      {/* ── Contact & Footer ── */}
      <Section title="Kontak & Footer" icon={Mail} defaultOpen={false}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1"><Mail size={11} /> Email Kontak</Label>
            <Input value={form.contact_email ?? ""} onChange={(e) => setF("contact_email", e.target.value)} placeholder="support@example.com" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1"><Phone size={11} /> WhatsApp Kontak (nomor saja)</Label>
            <Input value={form.contact_whatsapp ?? ""} onChange={(e) => setF("contact_whatsapp", e.target.value)} placeholder="628123456789" />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold">Teks Footer</Label>
            <Input value={form.footer_text ?? ""} onChange={(e) => setF("footer_text", e.target.value)} placeholder="© 2025 WA Gateway. All rights reserved." />
          </div>
        </div>
      </Section>

      {/* ── Hero Image ── */}
      <Section title="Hero Image (gambar di bawah CTA)" icon={ImageIcon} defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Jika diisi, gambar ini akan menggantikan mockup dashboard di hero section. Biarkan kosong untuk tampilkan mockup default.</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1"><Link2 size={11} /> URL Gambar</Label>
              <Input value={form.hero_image ?? ""} onChange={(e) => setF("hero_image", e.target.value)} placeholder="https://..." />
            </div>
            <div className="flex-shrink-0 pt-5">
              <input ref={heroImageInputRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("image", file);
                  try {
                    const res = await apiFetch("/upload/image", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.url) {
                      setF("hero_image", data.url);
                      toast({ title: "Hero image berhasil diupload" });
                    }
                  } catch (err) {
                    toast({ title: "Gagal upload gambar", variant: "destructive" });
                  }
                }} />
              <Button variant="outline" size="sm" className="gap-2 h-10" onClick={() => heroImageInputRef.current?.click()}>
                <Upload size={13} /> Upload
              </Button>
            </div>
          </div>
          {form.hero_image && (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img src={form.hero_image} alt="Hero preview" className="w-full max-h-48 object-cover" onError={(e) => { (e.target as HTMLImageElement).src = ""; }} />
              <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-7 px-2 text-xs bg-background/80 backdrop-blur border border-border" onClick={() => setF("hero_image", "")}>Hapus</Button>
            </div>
          )}
        </div>
      </Section>

      {/* ── SEO ── */}
      <Section title="SEO & Meta Tags" icon={Search} defaultOpen={false}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Judul Halaman (browser tab & Google)</Label>
              <Input value={form.seo_title ?? ""} onChange={(e) => setF("seo_title", e.target.value)} placeholder="WA Gateway — WhatsApp Business Platform" />
              <p className="text-[11px] text-muted-foreground">{(form.seo_title ?? "").length}/60 karakter (ideal: 50-60)</p>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Meta Description</Label>
              <Textarea value={form.seo_description ?? ""} onChange={(e) => setF("seo_description", e.target.value)} placeholder="Kelola semua pesan WhatsApp bisnis Anda..." className="text-xs resize-none min-h-[70px]" />
              <p className="text-[11px] text-muted-foreground">{(form.seo_description ?? "").length}/160 karakter (ideal: 150-160)</p>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Kata Kunci (pisahkan dengan koma)</Label>
              <Input value={form.seo_keywords ?? ""} onChange={(e) => setF("seo_keywords", e.target.value)} placeholder="whatsapp gateway, blast pesan, auto reply..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Author</Label>
              <Input value={form.seo_author ?? ""} onChange={(e) => setF("seo_author", e.target.value)} placeholder="WA Gateway" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Robots Directive</Label>
              <select value={form.seo_robots ?? "index, follow"} onChange={(e) => setF("seo_robots", e.target.value)}
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
                <option value="index, follow">index, follow (default — tampil di Google)</option>
                <option value="noindex, nofollow">noindex, nofollow (sembunyikan dari Google)</option>
                <option value="index, nofollow">index, nofollow</option>
                <option value="noindex, follow">noindex, follow</option>
              </select>
            </div>
          </div>

          {/* OG Image */}
          <div className="border-t border-border/40 pt-3 space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1"><FileImage size={12} /> OG Image (gambar preview saat di-share di media sosial)</Label>
            <p className="text-[11px] text-muted-foreground">Rekomendasi ukuran: 1200 × 630 px. Gunakan URL publik (file terupload didukung).</p>
            <div className="flex gap-2">
              <Input value={form.seo_og_image ?? ""} onChange={(e) => setF("seo_og_image", e.target.value)} placeholder="https://..." className="flex-1" />
              <input ref={ogImageInputRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("image", file);
                  try {
                    const res = await apiFetch("/upload/image", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.url) {
                      setF("seo_og_image", data.url);
                      toast({ title: "OG image berhasil diupload" });
                    }
                  } catch (err) {
                    toast({ title: "Gagal upload OG image", variant: "destructive" });
                  }
                }} />
              <Button variant="outline" size="sm" className="gap-2 h-10" onClick={() => ogImageInputRef.current?.click()}>
                <Upload size={13} /> Upload
              </Button>
            </div>
            {form.seo_og_image && (
              <div className="rounded-xl overflow-hidden border border-border">
                <img src={form.seo_og_image} alt="OG preview" className="w-full max-h-32 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">Preview Google / WhatsApp Share:</p>
              <div className="bg-background rounded-lg border border-border p-3 space-y-0.5">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate">{form.seo_title || "WA Gateway — WhatsApp Business Platform"}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{form.seo_description || "Deskripsi halaman akan tampil di sini..."}</p>
                <p className="text-[10px] text-muted-foreground">wagateway.id</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Favicon ── */}
      <Section title="Favicon (ikon browser & bookmark)" icon={Globe} defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Favicon tampil di tab browser, bookmark, dan shortcut. Format: SVG, PNG 32×32, atau ICO.</p>
          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="flex-shrink-0 w-14 h-14 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
              {form.site_favicon ? (
                <img src={form.site_favicon} alt="Favicon" className="w-10 h-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <Globe size={24} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <Input value={form.site_favicon ?? ""}
                  onChange={(e) => setF("site_favicon", e.target.value)}
                  placeholder="https://... atau upload file" className="text-sm flex-1" />
                <input ref={faviconInputRef} type="file" accept="image/*,.ico,.svg" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append("image", file);
                    try {
                      const res = await apiFetch("/upload/image", { method: "POST", body: formData });
                      const data = await res.json();
                      if (data.url) {
                        setF("site_favicon", data.url);
                        toast({ title: "Favicon berhasil diupload" });
                      }
                    } catch (err) {
                      toast({ title: "Gagal upload favicon", variant: "destructive" });
                    }
                  }} />
                <Button variant="outline" size="sm" className="gap-1.5 h-10 flex-shrink-0" onClick={() => faviconInputRef.current?.click()}>
                  <Upload size={13} /> Upload
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">Preview di browser:</p>
            <div className="flex items-center gap-2 bg-background rounded-lg border border-border px-3 py-2">
              {form.site_favicon ? (
                <img src={form.site_favicon} alt="fav" className="w-4 h-4 object-contain flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-4 h-4 rounded bg-emerald-500 flex-shrink-0" />
              )}
              <p className="text-xs font-medium truncate">{form.seo_title || form.site_name || "WA Gateway"}</p>
              <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">× tab</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Save bottom */}
      <div className="flex justify-end pt-2">
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Simpan Semua Perubahan
        </Button>
      </div>
    </div>
  );
}
