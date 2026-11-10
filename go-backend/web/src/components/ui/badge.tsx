import * as React from "react";
import { Badge as KumoBadge } from "@cloudflare/kumo";
import { cn } from "@/lib/utils";

/**
 * Badge aplikasi di atas Kumo UI (Cloudflare).
 * API variant tetap sama (default|secondary|destructive|outline|success).
 */

type AppVariant = "default" | "secondary" | "destructive" | "outline" | "success";

const variantMap: Record<
  AppVariant,
  "primary" | "secondary" | "red" | "outline" | "success"
> = {
  default: "primary",
  secondary: "secondary",
  destructive: "red",
  outline: "outline",
  success: "success",
};

export interface BadgeProps {
  variant?: AppVariant;
  className?: string;
  children?: React.ReactNode;
}

function Badge({ className, variant = "default", children }: BadgeProps) {
  return (
    <KumoBadge
      variant={variantMap[variant]}
      appearance="filled"
      className={cn(className)}
    >
      {children}
    </KumoBadge>
  );
}

export { Badge };
