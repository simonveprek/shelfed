import { describe, expect, it } from "vitest";
import { newer } from "../src/shared/version";

describe("newer", () => {
  it("compares versions by their numbers", () => {
    expect(newer("0.2.0", "0.1.0")).toBe(true);
    expect(newer("0.10.0", "0.9.3")).toBe(true);
    expect(newer("1.0", "0.9.9")).toBe(true);
    expect(newer("0.1.0", "0.1.0")).toBe(false);
    expect(newer("0.1.0", "0.2.0")).toBe(false);
  });

  it("never offers a pre-release or a broken tag", () => {
    expect(newer("0.3.0-beta.1", "0.2.0")).toBe(false);
    expect(newer("", "0.2.0")).toBe(false);
    expect(newer("latest", "0.2.0")).toBe(false);
  });

  it("counts a release as newer than its own pre-release", () => {
    expect(newer("0.2.0", "0.2.0-beta.1")).toBe(true);
    expect(newer("0.1.9", "0.2.0-beta.1")).toBe(false);
    expect(newer("0.2.1", "0.2.0-beta.1")).toBe(true);
  });
});
