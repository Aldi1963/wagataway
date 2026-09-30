import * as React from "react";
import { inputVariants } from "@cloudflare/kumo";
import { cn } from "@/lib/utils";

/**
 * Input aplikasi memakai gaya Kumo UI (Cloudflare) lewat `inputVariants`,
 * sehingga semua props input HTML standar tetap didukung penuh.
 */

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        data-kumo-component="input"
        className={cn(
          inputVariants({ variant: error ? "error" : "default", size: "base" }),
          "w-full",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
