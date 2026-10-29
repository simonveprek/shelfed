/** Where the site lives: at the root on Netlify, under /shelf on GitHub Pages. */
export const BASE = process.env.NEXT_PUBLIC_BASE ?? "";
export const VERSION = process.env.NEXT_PUBLIC_VERSION ?? "0.1.0";
export const REPO = "https://github.com/simonveprek/shelf";
export const RELEASES = `${REPO}/releases/latest`;

/** A file from public/, wherever the site is served. */
export const asset = (path: string) => `${BASE}/${path.replace(/^\//, "")}`;

export type System = "mac" | "win";
export type Arch = "arm64" | "x64";

/** The installer for a system, named the way the release builds them. */
export const installer = (os: System, arch: Arch) => `${RELEASES}/download/Shelfed-${VERSION}-${os}-${arch}.${os === "mac" ? "dmg" : "exe"}`;
