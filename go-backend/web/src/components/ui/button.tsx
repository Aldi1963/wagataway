import * as React from "react";
import { Button as KumoButton } from "@cloudflare/kumo";
import { cn } from "@/lib/utils";

/**
 * Button aplikasi di atas Kumo UI (Cloudflare).
 * API variant/size tetap sama seperti sebelumnya sehingga semua halaman
 * tidak perlu diubah; tampilannya mengikuti design system Kumo dengan
 * brand navy WaGataway. Bentuk pill dipertahankan (rounded-full).
 */

type AppVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "tint"
  | "success"
  | "warning";

type AppSize = "default" | "sm" | "lg" | "icon";

const variantMap: Record<
  AppVariant,
  "primary" | "secondary" | "ghost" | "destructive" | "outline"
> = {
  default: "primary",
  destructive: "destructive",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  link: "ghost",
  tint: "secondary",
  success: "secondary",
  warning: "secondary",
};

const sizeMap: Record<AppSize, "xs" | "sm" | "base" | "lg"> = {
  default: "base",
  sm: "sm",
  lg: "lg",
  icon: "base",
};

// Tinggi & padding eksplisit per size agar konsisten di semua variant.
// Ditaruh di className (posisi terakhir saat merge ke Kumo) sehingga
// twMerge selalu memenangkannya atas class size bawaan Kumo
// (terverifikasi: h-9/px-3/text-base Kumo -> h-10/px-5/text-sm, dst).
// Icon memakai size-10 (satu grup dengan size-9 bawaan Kumo) agar
// conflict-resolution twMerge deterministik.
const sizeClasses: Record<AppSize, string> = {
  default: "h-10 px-5 text-sm",
  sm: "h-8 px-4 text-xs",
  lg: "h-11 px-6",
  icon: "size-10",
};

// Soft tint ala MPWA untuk aksi berwanti (di atas Kumo secondary)
const tintClasses: Partial<Record<AppVariant, string>> = {
  tint: "bg-[#243370]/10 text-[#243370] border border-[#243370]/25 hover:bg-[#243370]/20 dark:bg-[#4c63d2]/15 dark:text-[#aab6f5] dark:border-[#4c63d2]/30 dark:hover:bg-[#4c63d2]/25",
  success:
    "bg-green-500/10 text-green-700 border border-green-500/25 hover:bg-green-500/20 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30 dark:hover:bg-green-500/25",
  warning:
    "bg-amber-500/10 text-amber-700 border border-amber-500/25 hover:bg-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/25",
  link: "underline underline-offset-4 px-2",
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  variant?: AppVariant;
  size?: AppSize;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      loading,
      title,
      children,
      ...props
    },
    ref
  ) => {
    const isIcon = size === "icon";
    const shared = {
      ref,
      variant: variantMap[variant],
      size: sizeMap[size],
      loading,
      type: type as "submit" | "reset" | "button",
      className: cn(
        "rounded-full",
        sizeClasses[size],
        tintClasses[variant],
        className
      ),
      ...props,
    } as const;
    if (isIcon) {
      return (
        <KumoButton
          {...shared}
          shape="circle"
          // Tombol ikon Kumo mewajibkan nama aksesibel; fallback ke string
          // kosong bila pemanggil tidak memberi aria-label/title.
          title={title ?? ""}
          className={cn("whitespace-nowrap", shared.className)}
        >
          {children}
        </KumoButton>
      );
    }
    return (
      <KumoButton
        {...shared}
        shape="base"
        title={title ?? ""}
        className={cn("whitespace-nowrap", shared.className)}
      >
        {children}
      </KumoButton>
    );
  }
);
Button.displayName = "Button";

export { Button };
