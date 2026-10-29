// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { languageOf, markAt, pickVoice, speakable, voicesFor } from "../src/renderer/src/reader/aloud";

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

  it("knows the paragraph's own language", () => {
    expect(speakable(SSML).lang).toBe("en");
  });

  it("understands languages however books write them", () => {
    expect(["en-GB", "eng", "English", "en"].map(languageOf)).toEqual(["en", "en", "en", "en"]);
    expect(["cs-CZ", "ces", "cze", "Czech"].map(languageOf)).toEqual(["cs", "cs", "cs", "cs"]);
    expect(languageOf(undefined)).toBe("");
  });

  // A Czech Mac: Zuzana is the default, the English voices aren't.
  const voice = (name: string, lang: string, isDefault = false) => ({ name, lang, voiceURI: name, default: isDefault, localService: true }) as SpeechSynthesisVoice;
  const mac = [voice("Zuzana", "cs-CZ", true), voice("Albert", "en-US"), voice("Daniel", "en-GB"), voice("Eddy", "en-US"), voice("Samantha", "en-US")];

  it("reads an English book in an English voice, even when the system's default is Czech", () => {
    expect(pickVoice(mac, "eng")?.name).toBe("Daniel");
    expect(pickVoice(mac, languageOf("en-US"))?.name).toBe("Daniel");
    expect(voicesFor(mac, "en").map((v) => v.name)).toEqual(["Daniel", "Samantha", "Eddy", "Albert"]);
  });

  it("keeps a chosen voice only for books in its language", () => {
    expect(pickVoice(mac, "en", "Samantha")?.name).toBe("Samantha");
    expect(pickVoice(mac, "en", "Zuzana")?.name).toBe("Daniel");
    expect(pickVoice(mac, "cs", "Samantha")?.name).toBe("Zuzana");
  });
});

