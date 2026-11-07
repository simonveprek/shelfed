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

/**
 * foliate-js can lay a page out, and look at what's on it, while the page is
 * still being read in, before it has a body. That throws, and it does it all
 * again properly once the page has one. These skip the early try. If a new
 * foliate-js changes the code, the build stops, so a guard can't silently go
 * missing.
 */
export const FOLIATE_GUARDS: Array<[string, string]> = [
  // The page laying itself out.
  ["if (!layout || !this.document) return", "if (!layout || !this.document?.body) return"],
  // The pages laying out the page, then finding what's in view, when the window changes size.
  ["    render() {\n        if (!this.#view) return\n", "    render() {\n        if (!this.#view?.document?.body) return\n"],
];
const foliateGuard = {
  name: "shelf-foliate-guard",
  transform(code: string, id: string) {
    if (!/foliate-js[\\/]paginator\.js$/.test(id)) return null;
    for (const [unguarded, guarded] of FOLIATE_GUARDS) {
      if (code.split(unguarded).length !== 2) throw new Error("foliate-js/paginator.js changed: check the guards in electron.vite.config.ts still fit");
      code = code.replace(unguarded, guarded);
    }
    return code;
  },
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
    plugins: [react(), tailwindcss(), devPolicy, foliateGuard],
    worker: { format: "es" },
    build: { target: "chrome140" },
  },
});
