import { describe, expect, it } from "vitest";
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
