import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The app's version names the installers the download buttons point at.
const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as { version: string };

// GitHub Pages serves a project site under /shelf; Netlify serves it at the root.
const base = process.env.SITE_BASE ?? "";

export default {
  output: "export",
  basePath: base,
  trailingSlash: true,
  images: { unoptimized: true },
  // The site is its own project, though the app's lockfile sits one folder up.
  turbopack: { root: import.meta.dirname },
  env: { NEXT_PUBLIC_BASE: base, NEXT_PUBLIC_VERSION: version },
} satisfies NextConfig;
