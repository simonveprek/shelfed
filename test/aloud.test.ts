// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { markAt, speakable } from "../src/renderer/src/reader/aloud";

/** A paragraph as foliate-js hands it over: SSML with a mark before every word. */
const SSML = `<speak xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en"><mark name="0"/>It <mark name="1"/>is a <mark name="2"/>truth
  <mark name="3"/>universally acknowledged.</speak>`;

describe("reading aloud", () => {
  it("turns a paragraph into words to say, with where each mark falls", () => {
    const { text, marks } = speakable(SSML);
    expect(text).toBe("It is a truth universally acknowledged.");
    expect(marks).toEqual([[0, "0"], [3, "1"], [8, "2"], [14, "3"]]);
  });

  it("follows the voice: each word it reaches belongs to the mark before it", () => {
    const { marks } = speakable(SSML);
    expect(markAt(marks, 0)).toBe("0");
    expect(markAt(marks, 5)).toBe("1");
    expect(markAt(marks, 14)).toBe("3");
    expect(markAt(marks, 99)).toBe("3");
  });
});
