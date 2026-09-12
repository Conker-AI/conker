import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    // The source package's internal alias belongs to the design system, not this app.
    alias: {
      "@": fileURLToPath(new URL("../design-system/src", import.meta.url)),
    },
    dedupe: ["react", "react-dom", "radix-ui"],
  },
});
