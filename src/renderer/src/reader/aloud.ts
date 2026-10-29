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
  return { text: text.trimEnd(), marks };
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

/** The system's voices, the ones for this language first, then the rest. */
export function useVoices(lang: string) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices()));
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  const base = lang.toLowerCase().split("-")[0];
  const own = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  return [...(own.length ? own : voices)].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
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
  const voices = useVoices(options.lang);
  const voicesRef = useRef(voices);
  voicesRef.current = voices;

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
    const { text, marks } = speakable(ssml);
    if (!text.trim()) return say(v.tts.next(), mine);
    const words = new SpeechSynthesisUtterance(text);
    const { voice, rate, lang } = opts.current;
    words.voice = voicesRef.current.find((x) => x.voiceURI === voice) ?? voicesRef.current[0] ?? null;
    words.lang = words.voice?.lang ?? lang;
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
