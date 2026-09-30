import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

// Animasi loading cantik khas WaGataway — pesawat kertas navy yang melayang
// dengan ripple dan titik-titik memantul.
export function PageTransitionLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-5", className)}>
      <div className="relative flex items-center justify-center w-24 h-24">
        {/* Ripple rings */}
        <span className="absolute inset-0 rounded-full bg-[#243370]/15 animate-ping-slow" />
        <span
          className="absolute inset-0 rounded-full bg-[#243370]/10 animate-ping-slow"
          style={{ animationDelay: "0.6s" }}
        />
        {/* Lingkaran navy + pesawat */}
        <span className="relative flex w-16 h-16 items-center justify-center rounded-full bg-[#243370] shadow-[0_8px_24px_rgba(36,51,112,0.45)]">
          <Send className="w-7 h-7 text-white animate-float-plane" />
        </span>
      </div>
      {/* Titik-titik memantul */}
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-[#243370] dark:bg-[#8fa0e8] animate-bounce-dot"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="text-sm font-medium text-muted-foreground animate-pulse-soft">
        Memuat...
      </p>
    </div>
  );
}
