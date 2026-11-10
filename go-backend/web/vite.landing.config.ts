import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Build khusus landing page publik: bundle minimal (React + Landing +
// kamus landing saja, tanpa i18n penuh / dashboard). Output ke dist-landing.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@/lib/i18n": path.resolve(__dirname, "./src/lib/i18n-landing.tsx"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist-landing",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: path.resolve(__dirname, "landing.html"),
      },
    },
  },
});
