import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASES_MADE } from "../site/changelog";
import { VERSION } from "../site/lib";
import { facesToShow } from "../src/renderer/src/lib/shelf-faces";
import { newer } from "../src/shared/version";
import { savedReader } from "../src/shared/reader";

describe("the reader's page colour, for someone who already has settings", () => {
  it("follows the app if light was only ever the starting point", () => {
    expect(savedReader({ theme: "light", size: 20 })).toEqual({ theme: "auto", size: 20 });
  });

  it("stays light for someone who chose it", () => {
    expect(savedReader({ theme: "light", picked: true }).theme).toBe("light");
  });

  it.each(["sepia", "dark", "black", "auto"] as const)("leaves %s alone, since that was a choice", (theme) => {
    expect(savedReader({ theme }).theme).toBe(theme);
  });

  it("has nothing to do with no settings at all", () => {
    expect(savedReader({})).toEqual({});
  });
});

describe("which sides of a book on the shelf are worth building", () => {
  const WIDTH = 1000;
  const FAR_LEFT = 50;
  const FAR_RIGHT = 950;
  const MIDDLE = 500;
  const rows = (...h: number[]) => h.map((value) => ({ h: value }));

  it("builds neither side where both neighbours are as tall or taller", () => {
    expect(facesToShow(rows(200, 150, 200), 1, MIDDLE, WIDTH)).toEqual({ left: false, right: false });
  });

  it("builds the side that stands taller than its neighbour, when it faces the viewer", () => {
    // Left of the middle, it's the right sides that face the viewer.
    expect(facesToShow(rows(200, 150), 0, FAR_LEFT, WIDTH).right).toBe(true);
    // Right of the middle, the left ones.
    expect(facesToShow(rows(150, 200), 1, FAR_RIGHT, WIDTH).left).toBe(true);
  });

  it("doesn't build a side turned away from the viewer", () => {
    expect(facesToShow(rows(150, 200), 1, FAR_LEFT, WIDTH).left).toBe(false);
    expect(facesToShow(rows(200, 150), 0, FAR_RIGHT, WIDTH).right).toBe(false);
  });

  it("builds both near the middle, since the case leans", () => {
    expect(facesToShow(rows(150, 200, 150), 1, MIDDLE, WIDTH)).toEqual({ left: true, right: true });
  });

  it("always shows the end of a run of books", () => {
    expect(facesToShow(rows(200), 0, MIDDLE, WIDTH)).toEqual({ left: true, right: true });
    expect(facesToShow(rows(100, 200), 1, FAR_LEFT, WIDTH).right).toBe(true);
    expect(facesToShow(rows(200, 100), 0, FAR_RIGHT, WIDTH).left).toBe(true);
  });

  it("doesn't show a side where the neighbour is exactly as tall", () => {
    expect(facesToShow(rows(200, 200, 200), 1, MIDDLE, WIDTH)).toEqual({ left: false, right: false });
  });
});

describe("the changelog", () => {
  it("has the version the site offers, newest first, every entry filled in", () => {
    expect(RELEASES_MADE[0].version).toBe(VERSION);
    const versions = RELEASES_MADE.map((r) => r.version);
    expect([...versions].sort((a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0))).toEqual(versions);
    for (const release of RELEASES_MADE) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.summary).not.toBe("");
      expect(release.changes.length).toBeGreaterThan(0);
    }
  });
});

describe("the guard over foliate-js", () => {
  it("still fits the paginator that's installed, once each", async () => {
    const { FOLIATE_GUARDS } = await import("../electron.vite.config");
    const paginator = readFileSync(join(import.meta.dirname, "../node_modules/foliate-js/paginator.js"), "utf8");
    for (const [unguarded] of FOLIATE_GUARDS) expect(paginator.split(unguarded)).toHaveLength(2);
  });
});
