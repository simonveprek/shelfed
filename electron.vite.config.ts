import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Vite's dev server needs inline scripts and its socket, so development gets a looser policy than the app ships with. */
const devPolicy = {
  name: "shelf-dev-policy",
  apply: "serve" as const,
  transformIndexHtml: (html: string) =>
    html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:;").replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*"),
};

export default defineConfig({
  main: {
    build: { rollupOptions: { external: ["nodemailer", "mammoth"] } },
  },
  preload: {
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        // The kit links pages with next/link. Here a link is a plain anchor.
        "next/link": resolve("src/renderer/src/shims/link.tsx"),
      },
    },
    plugins: [react(), tailwindcss(), devPolicy],
    worker: { format: "es" },
    build: { target: "chrome140" },
  },
});
