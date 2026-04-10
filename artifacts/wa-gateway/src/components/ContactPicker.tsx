import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search, Check, X, UserPlus, Tag, Phone, ChevronDown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface PickedContact {
  id: string;
  name: string;
  phone: string;
  tags: string[];
}

interface ContactPickerProps {
  mode: "single" | "multi";
  onSelect: (contacts: PickedContact[]) => void;
  trigger?: React.ReactNode;
  selected?: PickedContact[];
}

export function ContactPicker({ mode, onSelect, trigger, selected = [] }: ContactPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set(selected.map((c) => c.id)));
  const [pickedMap, setPickedMap] = useState<Record<string, PickedContact>>(
    Object.fromEntries(selected.map((c) => [c.id, c]))
  );

  const { data, isLoading } = useQuery<{ data: PickedContact[]; total: number }>({
    queryKey: ["contacts-picker"],
    queryFn: () => apiFetch("/contacts?limit=500&page=1").then((r) => r.json()),
    staleTime: 30000,
    enabled: open,
  });

  const contacts = data?.data ?? [];

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    contacts.forEach((c) => (c.tags ?? []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchTag = !activeTag || (c.tags ?? []).includes(activeTag);
      return matchSearch && matchTag;
    });
  }, [contacts, search, activeTag]);

  function toggle(c: PickedContact) {
    if (mode === "single") {
      const newSet = new Set([c.id]);
      setPicked(newSet);
      setPickedMap({ [c.id]: c });
    } else {
      const next = new Set(picked);
      const nextMap = { ...pickedMap };
      if (next.has(c.id)) {
        next.delete(c.id);
        delete nextMap[c.id];
      } else {
        next.add(c.id);
        nextMap[c.id] = c;
      }
      setPicked(next);
      setPickedMap(nextMap);
    }
  }

  function selectAll() {
    const next = new Set(picked);
    const nextMap = { ...pickedMap };
    filtered.forEach((c) => { next.add(c.id); nextMap[c.id] = c; });
    setPicked(next);
    setPickedMap(nextMap);
  }

  function deselectAll() {
    const next = new Set(picked);
    const nextMap = { ...pickedMap };
    filtered.forEach((c) => { next.delete(c.id); delete nextMap[c.id]; });
    setPicked(next);
    setPickedMap(nextMap);
  }

  function confirm() {
    onSelect(Array.from(picked).map((id) => pickedMap[id]).filter(Boolean));
    setOpen(false);
  }

  function handleOpen() {
    setPicked(new Set(selected.map((c) => c.id)));
    setPickedMap(Object.fromEntries(selected.map((c) => [c.id, c])));
    setSearch("");
    setActiveTag(null);
    setOpen(true);
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => picked.has(c.id));

  return (
    <>
      <div onClick={handleOpen}>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-sm">
            <Users className="w-4 h-4" /> Pilih dari Kontak
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
                <Users className="w-3.5 h-3.5" style={{ color: "hsl(145 63% 42%)" }} />
              </div>
              {mode === "multi" ? "Pilih Kontak" : "Pilih Satu Kontak"}
              {picked.size > 0 && (
                <Badge className="ml-1 text-white text-xs" style={{ backgroundColor: "hsl(145 63% 45%)" }}>
                  {picked.size} dipilih
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Search + filter */}
          <div className="px-4 py-3 border-b border-border space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau nomor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
                autoFocus
              />
            </div>
            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTag(null)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    !activeTag
                      ? "text-white border-transparent"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  )}
                  style={!activeTag ? { backgroundColor: "hsl(145 63% 45%)" } : {}}
                >
                  Semua
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      activeTag === tag
                        ? "text-white border-transparent"
                        : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                    )}
                    style={activeTag === tag ? { backgroundColor: "hsl(145 63% 45%)" } : {}}
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Select all row (multi only) */}
          {mode === "multi" && filtered.length > 0 && (
            <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{filtered.length} kontak ditampilkan</span>
              <button
                type="button"
                onClick={allFilteredSelected ? deselectAll : selectAll}
                className="text-xs font-medium hover:underline"
                style={{ color: "hsl(145 63% 42%)" }}
              >
                {allFilteredSelected ? "Batalkan semua" : "Pilih semua"}
              </button>
            </div>
          )}

          {/* Contact list */}
          <ScrollArea className="h-72">
            {isLoading ? (
              <div className="flex items-center justify-center h-full py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <UserPlus className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Kontak tidak ditemukan</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Coba kata kunci atau filter lain</p>
              </div>
            ) : (
              <div className="py-1">
                {filtered.map((c) => {
                  const isSelected = picked.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60",
                        isSelected ? "bg-primary/5" : ""
                      )}
                    >
                      {mode === "multi" ? (
                        <Checkbox
                          checked={isSelected}
                          className="shrink-0 pointer-events-none"
                          style={isSelected ? { backgroundColor: "hsl(145 63% 45%)", borderColor: "hsl(145 63% 45%)" } : {}}
                        />
                      ) : (
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                          isSelected ? "border-primary" : "border-border"
                        )}
                          style={isSelected ? { borderColor: "hsl(145 63% 45%)" } : {}}>
                          {isSelected && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(145 63% 45%)" }} />}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-sm font-medium truncate", isSelected ? "text-foreground" : "")}>
                            {c.name}
                          </span>
                          {(c.tags ?? []).map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50 hidden sm:inline">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono">{c.phone}</span>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 45%)" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="px-4 py-3 border-t border-border bg-muted/20">
            <div className="flex items-center justify-between w-full gap-3">
              <span className="text-xs text-muted-foreground">
                {picked.size > 0 ? (
                  <>{picked.size} kontak dipilih</>
                ) : (
                  <>Belum ada kontak dipilih</>
                )}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Batal
                </Button>
                <Button
                  size="sm"
                  onClick={confirm}
                  disabled={picked.size === 0}
                  className="gap-1.5 text-white"
                  style={{ backgroundColor: "hsl(145 63% 45%)" }}
                >
                  <Check className="w-3.5 h-3.5" />
                  {mode === "multi"
                    ? `Tambahkan ${picked.size} Kontak`
                    : "Pilih Kontak"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── ContactChips: tampilkan kontak terpilih sebagai pill ─────────────────── */
interface ContactChipsProps {
  contacts: PickedContact[];
  onRemove: (id: string) => void;
  className?: string;
}

export function ContactChips({ contacts, onRemove, className }: ContactChipsProps) {
  if (contacts.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {contacts.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium border"
          style={{ backgroundColor: "hsl(145 63% 49% / 0.08)", borderColor: "hsl(145 63% 49% / 0.25)", color: "hsl(145 63% 35%)" }}
        >
          <span className="max-w-[120px] truncate">{c.name}</span>
          <span className="text-[10px] opacity-70 font-mono">{c.phone.slice(-4)}</span>
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            className="w-4 h-4 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
