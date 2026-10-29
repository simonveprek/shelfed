import { describe, expect, it } from "vitest";
import { rainbowKey } from "../src/renderer/src/lib/rainbow";

describe("a rainbow shelf", () => {
  it("runs red, orange, yellow, green, blue, violet, then the greys from light to dark", () => {
    const spines = { black: "#1d1b18", blue: "#2b4bff", grey: "#8c857c", red: "#c4372b", green: "#2f8f5b", violet: "#a23bff", orange: "#b5651d", yellow: "#d8b13a", white: "#f6f5f1" };
    const order = Object.entries(spines).sort((a, b) => rainbowKey(a[1]) - rainbowKey(b[1])).map(([name]) => name);
    expect(order).toEqual(["red", "orange", "yellow", "green", "blue", "violet", "white", "grey", "black"]);
  });

  it("orders spines in ink light to dark", () => {
    const ink = (share: number) => `color-mix(in oklab, var(--foreground) ${share}%, var(--background))`;
    expect(rainbowKey(ink(32))).toBeLessThan(rainbowKey(ink(80)));
  });
});
