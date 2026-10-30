/** The site's own address, for links that leave it: canonical, sitemap, structured data. */
export const SITE = (process.env.SITE_URL ?? "https://shelfed.simonveprek.cz").replace(/\/$/, "");

/** Where the site lives: at the root on its own domain, under a folder on a project page. */
export const BASE = process.env.NEXT_PUBLIC_BASE ?? "";
export const VERSION = process.env.NEXT_PUBLIC_VERSION ?? "0.1.3";
export const REPO = "https://github.com/simonveprek/shelfed";
export const RELEASES = `${REPO}/releases/latest`;

/** A file from public/, wherever the site is served. */
export const asset = (path: string) => `${BASE}/${path.replace(/^\//, "")}`;

export type System = "mac" | "win";
export type Arch = "arm64" | "x64";

/** The installer for a system, named the way the release builds them. */
export const installer = (os: System, arch: Arch) => `${RELEASES}/download/Shelfed-${VERSION}-${os}-${arch}.${os === "mac" ? "dmg" : "exe"}`;
