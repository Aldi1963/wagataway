import { cn } from "@/lib/utils";

/** Skeleton loading baris — pulse polos tanpa gradient. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-secondary", className)} />;
}
