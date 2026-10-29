import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/*
 * Reading a book aloud, in the voices the system already has (macOS and
 * Windows both bring Czech and English ones), so nothing is installed and
 * nothing goes online. foliate-js walks the book a paragraph at a time and
 * marks every word; the voice reads the paragraph, and as it says each word
 * the page selects it, turning when it has to. At the end of a chapter it
 * carries on into the next.
 */

/** foliate-js's reader of a section, a paragraph at a time, as SSML with a mark before every word. */
type Tts = {
  doc: Document;
  start(): string | undefined;
  resume(): string | undefined;
  next(paused?: boolean): string | undefined;
  prev(paused?: boolean): string | undefined;
  from(range: Range): string | undefined;
  setMark(mark: string): void;
};

/** The parts of foliate's view reading aloud needs. */
export type Speaking = {
  initTTS: (granularity?: "word" | "sentence") => Promise<void>;
  tts: Tts | null;
  renderer: { nextSection?: () => Promise<unknown> };
};

/** A paragraph as words to say, and where in them each of foliate's marks falls. */
export function speakable(ssml: string) {
  const doc = new DOMParser().parseFromString(ssml, "application/xml");
  let text = "";
  const marks: Array<[offset: number, name: string]> = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Runs of spaces and line breaks become one space as they come, so each mark's place is where the voice is.
        let words = (child.nodeValue ?? "").replace(/\s+/g, " ");
        if (words.startsWith(" ") && (!text || text.endsWith(" "))) words = words.slice(1);
        text += words;
      } else if ((child as Element).localName === "mark") marks.push([text.length, (child as Element).getAttribute("name") ?? ""]);
      else walk(child);
    }
  };
  walk(doc.documentElement);
  // The paragraph says what language it's in, which beats what the book's details claim.
  const lang = doc.documentElement.getAttribute("xml:lang") ?? doc.documentElement.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") ?? "";
  return { text: text.trimEnd(), marks, lang };
}

/** The mark for a place in the words: the last one at or before it. */
export function markAt(marks: Array<[number, string]>, at: number) {
  let found: string | undefined;
  for (const [offset, name] of marks) {
    if (offset > at) break;
    found = name;
  }
  return found;
}

/** ISO 639-2 codes, as Calibre and many books write a language, to the two letters voices use. */
const THREE: Record<string, string> = {
  eng: "en", ces: "cs", cze: "cs", slk: "sk", slo: "sk", deu: "de", ger: "de", fra: "fr", fre: "fr", spa: "es", ita: "it",
  pol: "pl", rus: "ru", ukr: "uk", por: "pt", nld: "nl", dut: "nl", hun: "hu", swe: "sv", dan: "da", nor: "no", fin: "fi",
  jpn: "ja", zho: "zh", chi: "zh", kor: "ko", ell: "el", gre: "el", tur: "tr", heb: "he", ara: "ar",
};

/** A language as two letters, from "en-GB", "eng" or "English" alike; "" when there's nothing to go on. */
export function languageOf(code?: string | null) {
  const base = (code ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (base === "english") return "en";
  if (base === "czech" || base === "čeština") return "cs";
  return THREE[base] ?? base;
}

/** The voices for a language, the best first; every voice when the language is unknown or has none. */
export function voicesFor(all: SpeechSynthesisVoice[], lang?: string | null) {
  const base = languageOf(lang);
  const own = base ? all.filter((v) => languageOf(v.lang) === base) : [];
  return [...(own.length ? own : all)].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The voice for a paragraph: the one chosen, if it speaks its language, or else the best that does. */
export function pickVoice(all: SpeechSynthesisVoice[], lang: string | null | undefined, chosen?: string) {
  const voices = voicesFor(all, lang);
  return voices.find((v) => v.voiceURI === chosen) ?? voices[0] ?? null;
}

/** Every voice the system has, kept up to date as it loads them. */
export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices()));
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}

/** macOS's joke voices, never the one a book starts with. */
const NOVELTY = new Set(["Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester", "Organ", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox"]);
/** Voices that read a book well, by the first word of their name. */
const GOOD = new Set(["Samantha", "Daniel", "Karen", "Moira", "Ava", "Allison", "Tom", "Zuzana", "Microsoft"]);

/** The system's own default first, then good voices, then the rest, the joke voices last. */
function rank(voice: SpeechSynthesisVoice) {
  if (NOVELTY.has(voice.name)) return 3;
  if (voice.default) return 0;
  return GOOD.has(voice.name.split(" ")[0]) ? 1 : 2;
}

/**
 * Reading aloud in a book view: plays from where the page is, pauses, skips a
 * paragraph either way, and stops when the reader closes.
 */
export function useReadAloud(view: RefObject<Speaking | null>, where: RefObject<Range | null>, options: { lang: string; voice?: string; rate: number }) {
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState(false);
  // Each run of speaking has a number; a voice ending after a newer run began says nothing more.
  const run = useRef(0);
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const opts = useRef(options);
  opts.current = options;
  const all = useVoices();
  const voicesRef = useRef(all);
  voicesRef.current = all;
  // The voices offered: those for the book's language.
  const voices = voicesFor(all, options.lang);

  const say = useCallback(async (ssml: string | undefined, mine: number) => {
    const v = view.current;
    if (!v?.tts || mine !== run.current) return;
    // The chapter is done: on into the next, or the end of the book.
    if (ssml === undefined) {
      const chapter = v.tts.doc;
      await v.renderer.nextSection?.().catch(() => {});
      await v.initTTS("word").catch(() => {});
      if (mine !== run.current) return;
      // Still the same chapter: that was the last.
      if (!v.tts || v.tts.doc === chapter) return finish(mine);
      return say(v.tts.start(), mine);
    }
    const { text, marks, lang: spoken } = speakable(ssml);
    if (!text.trim()) return say(v.tts.next(), mine);
    const words = new SpeechSynthesisUtterance(text);
    const { voice, rate, lang } = opts.current;
    const language = languageOf(spoken) || languageOf(lang);
    words.voice = pickVoice(voicesRef.current, language, voice);
    words.lang = words.voice?.lang ?? language;
    words.rate = rate;
    if (marks[0]) v.tts.setMark(marks[0][1]);
    words.onboundary = (e) => {
      if (mine !== run.current) return;
      const mark = markAt(marks, e.charIndex);
      if (mark) v.tts?.setMark(mark);
    };
    words.onend = () => {
      if (mine === run.current) say(v.tts?.next(), mine);
    };
    words.onerror = (e) => {
      // Cancelling, which pausing does, ends a voice with an error of its own; anything else stops.
      if (e.error !== "canceled" && e.error !== "interrupted" && mine === run.current) finish(mine);
    };
    current.current = words;
    speechSynthesis.speak(words);
  }, []);

  const finish = (mine: number) => {
    if (mine !== run.current) return;
    run.current++;
    speechSynthesis.cancel();
    setPlaying(false);
  };

  const play = useCallback(async () => {
    const v = view.current;
    if (!v || typeof speechSynthesis === "undefined") return;
    const mine = ++run.current;
    speechSynthesis.cancel();
    setPlaying(true);
    setActive(true);
    if (v.tts && active) return say(v.tts.resume(), mine);
    await v.initTTS("word");
    if (mine !== run.current || !v.tts) return;
    const here = where.current;
    let ssml: string | undefined;
    try {
      ssml = here ? v.tts.from(here) : v.tts.start();
    } catch {
      ssml = v.tts.start();
    }
    say(ssml, mine);
  }, [active, say]);

  const pause = useCallback(() => {
    run.current++;
    speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  const skip = useCallback((dir: 1 | -1) => {
    const v = view.current;
    if (!v?.tts) return;
    const mine = ++run.current;
    speechSynthesis.cancel();
    setPlaying(true);
    say(dir > 0 ? v.tts.next() : v.tts.prev(), mine);
  }, [say]);

  const stop = useCallback(() => {
    run.current++;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setPlaying(false);
    setActive(false);
  }, []);

  // A new voice or speed takes over from the paragraph being read.
  useEffect(() => {
    if (!playing || !view.current?.tts) return;
    const mine = ++run.current;
    speechSynthesis.cancel();
    say(view.current.tts.resume(), mine);
  }, [options.voice, options.rate]);

  // Closing the book stops the voice.
  useEffect(() => stop, []);

  return { playing, active, voices, play, pause, skip, stop, available: typeof speechSynthesis !== "undefined" };
}
