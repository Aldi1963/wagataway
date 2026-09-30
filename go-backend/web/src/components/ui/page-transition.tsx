import { useEffect, useState } from "react";
import { Lottie } from "lottie-react";
import { cn } from "@/lib/utils";
import planeLoader from "@/assets/paper-plane-loader.json";

// Animasi loading WaGataway — pesawat kertas navy muter (Lottie,
// "Paper plane Loader" oleh Rana Adeel Farrukh, Lottie Simple License,
// warna di-tint ke navy brand).
export function PageTransitionLoader({ className }: { className?: string }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <Lottie
        src={planeLoader}
        loop={!reducedMotion}
        autoplay={!reducedMotion}
        className="w-48 h-32"
        aria-label="Memuat"
      />
      <p className="text-sm font-medium text-muted-foreground animate-pulse-soft">
        Memuat...
      </p>
    </div>
  );
}
