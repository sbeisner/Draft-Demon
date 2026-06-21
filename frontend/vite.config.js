import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" so the built bundles load from file:// inside Electron.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173 },
});
