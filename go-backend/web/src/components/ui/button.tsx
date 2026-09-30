import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Navy solid — aksi utama
        default:
          "bg-primary text-primary-foreground border border-primary hover:opacity-90 active:scale-[0.98]",
        // Soft red tint — aksi destruktif (ala MPWA: Clear All / Delete All)
        destructive:
          "bg-red-500/10 text-red-700 border border-red-500/25 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30 dark:hover:bg-red-500/25 active:scale-[0.98]",
        outline:
          "border border-border bg-background hover:bg-secondary text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-muted",
        ghost:
          "hover:bg-secondary text-foreground",
        link:
          "text-foreground underline-offset-4 hover:underline",
        // Soft navy tint
        tint:
          "bg-[#243370]/10 text-[#243370] border border-[#243370]/25 hover:bg-[#243370]/20 dark:bg-[#4c63d2]/15 dark:text-[#aab6f5] dark:border-[#4c63d2]/30 dark:hover:bg-[#4c63d2]/25 active:scale-[0.98]",
        // Soft green tint — Import
        success:
          "bg-green-500/10 text-green-700 border border-green-500/25 hover:bg-green-500/20 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30 dark:hover:bg-green-500/25 active:scale-[0.98]",
        // Soft amber tint — Export
        warning:
          "bg-amber-500/10 text-amber-700 border border-amber-500/25 hover:bg-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/25 active:scale-[0.98]",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-full",
        sm: "h-8 rounded-full px-3 text-xs",
        lg: "h-10 rounded-full px-6",
        icon: "h-9 w-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
