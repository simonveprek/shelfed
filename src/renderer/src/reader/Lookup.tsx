import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import type { Lookup } from "../../../shared/types";
import { Button, EASE, Panel, SkeletonText } from "@/components/ui";
import { language, t, tc } from "../../../shared/i18n";
import { api } from "@/lib/api";

/** Whether a selection is short enough to look up: a word or a few. */
export const canLookUp = (text: string) => /\p{L}/u.test(text) && text.trim().length <= 64 && text.trim().split(/\s+/).length <= 4;

/** A language's name in the app's own language, from its code. */
function languageName(code: string, fallback: string) {
  try {
    const name = new Intl.DisplayNames([language()], { type: "language" }).of(code);
    return name && name !== code ? name[0].toLocaleUpperCase(language()) + name.slice(1) : fallback;
  } catch {
    return fallback;
  }
}

/** What a selected word means, in a card by it. */
export function LookupCard({ text, bookLanguage, x, y, onClose }: { text: string; bookLanguage?: string; x: number; y: number; onClose: () => void }) {
  const [answer, setAnswer] = useState<Lookup | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api.lookUp(text, bookLanguage).then(
      (found) => alive && setAnswer(found),
      (err: Error) => alive && setError(err.message),
    );
    return () => {
      alive = false;
    };
  }, [text, bookLanguage]);

  useEffect(() => {
    // Keys come here, not to the book's page, so Escape closes the card rather than the book.
    card.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.min(Math.max(16, x - 170), window.innerWidth - 356);
  // Under the words when there's room, above them low on the page.
  const place = y > window.innerHeight * 0.55 ? { left, bottom: window.innerHeight - y + 12 } : { left, top: y + 30 };
  const found = answer && (answer.senses.length || answer.wiki);

  return (
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} />
      <motion.div
        ref={card}
        tabIndex={-1}
        className="fixed z-[61] w-[340px] outline-none"
        style={place}
        initial={{ opacity: 0, y: -6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: EASE } }}
        role="dialog"
        aria-label={t("Look up")}
      >
        <Panel className="flex max-h-[min(440px,calc(100vh-48px))] flex-col gap-3 overflow-y-auto p-4 shadow-float">
          <div>
            <h3 className="serif text-[22px] leading-tight text-foreground">{answer?.word ?? text}</h3>
            {answer?.form && <p className="mt-0.5 text-[12px] text-muted-foreground">{t("“{form}” is a form of “{word}”", { form: answer.form, word: answer.word })}</p>}
          </div>

          {answer === undefined && !error && <SkeletonText lines={3} />}
          {error && <p className="text-[13px] text-muted-foreground">{error}</p>}
          {answer === null && <p className="text-[13px] text-muted-foreground">{t("Select a word or a few to look them up.")}</p>}
          {answer && !found && <p className="text-[13px] text-muted-foreground">{t("Nothing found for “{word}”.", { word: answer.word })}</p>}

          {answer?.senses.map((sense, i) => (
            <section key={i} className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {[sense.part && tc("word", sense.part), languageName(sense.code, sense.language)].filter(Boolean).join(" · ")}
              </p>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13.5px] leading-snug text-foreground marker:text-muted-foreground">
                {sense.meanings.map((meaning, j) => <li key={j}>{meaning}</li>)}
              </ol>
            </section>
          ))}

          {answer?.wiki && (
            <section className="flex flex-col gap-1.5">
              {answer.senses.length > 0 && <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("From Wikipedia")}</p>}
              <p className="text-[13.5px] leading-snug text-foreground">{answer.wiki.extract}</p>
            </section>
          )}

          {answer && found && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-muted-foreground">{answer.senses.length ? t("Meanings from Wiktionary, in English.") : t("From Wikipedia")}</p>
              <Button size="sm" variant="ghost" icon={ArrowUpRight01Icon} onClick={() => api.openExternal(answer.wiki && !answer.senses.length ? answer.wiki.url : answer.more)}>
                {t("More")}
              </Button>
            </div>
          )}
        </Panel>
      </motion.div>
    </>
  );
}
