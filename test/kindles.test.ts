import { describe, expect, it } from "vitest";
import { FINISHES, KINDLES, kindleById, kindleFromSerial } from "../src/shared/kindles";

describe("recognising a Kindle from its serial number", () => {
  it("reads the two-character code in older serials", () => {
    expect(kindleFromSerial("B024123456789012")?.id).toBe("pw1");
    expect(kindleFromSerial("90D4ABCDEFGHIJKL")?.id).toBe("pw2");
  });

  it("reads the three-character code in newer serials", () => {
    expect(kindleFromSerial("G090G1053456ABCD")?.id).toBe("pw3");
    expect(kindleFromSerial("G000PP0123456789")?.id).toBe("pw4");
    expect(kindleFromSerial("G001LG0123456789")?.id).toBe("pw5");
  });

  it("ignores case and spaces", () => {
    expect(kindleFromSerial("g000 pp01 2345 6789")?.id).toBe("pw4");
  });

  it("knows nothing about serials it can't place", () => {
    expect(kindleFromSerial("ZZZZZZZZ")).toBeUndefined();
    expect(kindleFromSerial("")).toBeUndefined();
  });
});

describe("the Kindle list", () => {
  it("gives every model a finish that exists", () => {
    for (const k of KINDLES) {
      expect(k.finishes.length, k.id).toBeGreaterThan(0);
      for (const f of k.finishes) expect(FINISHES[f], `${k.id} ${f}`).toBeDefined();
    }
  });

  it("never gives one device code to two models", () => {
    const seen = new Map<string, string>();
    for (const k of KINDLES)
      for (const code of k.codes) {
        expect(seen.get(code), `${code} in ${k.id} and ${seen.get(code)}`).toBeUndefined();
        seen.set(code, k.id);
      }
  });

  it("has unique ids, found by id", () => {
    expect(new Set(KINDLES.map((k) => k.id)).size).toBe(KINDLES.length);
    expect(kindleById("scribe1")?.name).toBe("Kindle Scribe");
    expect(kindleById(undefined)).toBeUndefined();
  });
});
