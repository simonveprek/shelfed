import { motion } from "framer-motion";
import { Button, Dialog, EASE } from "@/components/ui";
import { openReader } from "@/lib/actions";
import { highlightsOf } from "@/lib/annotations";
import { nextInSeries } from "@/lib/commonplace";
import { patchBooks, useStore } from "@/lib/store";
import { authorsOf, duration } from "@/lib/util";
import { Cover } from "./Cover";
import { Stars } from "./Inspector";
import { Kindred } from "./Suggestions";
import { t, tn } from "../../../shared/i18n";

/** The last page of a book: a moment to take it in, say what you thought, and see what's next. */
export function Finished() {
  const id = useStore((s) => s.finishing);
  const book = useStore((s) => s.books.find((b) => b.id === id));
  const books = useStore((s) => s.books);
  if (!book) return null;
  const done = () => useStore.setState({ finishing: null });
  const leave = () => useStore.setState({ finishing: null, reading: null });
  const open = (next: string) => {
    useStore.setState({ finishing: null });
    openReader(next);
  };
  const next = nextInSeries(book, books);
  const marks = highlightsOf(book).length;
  const facts = [
    (book.readSeconds ?? 0) >= 60 ? t("Read in {time}", { time: duration(book.readSeconds ?? 0) }) : null,
    marks ? tn(marks, "{n} line marked", "{n} lines marked") : null,
  ].filter(Boolean);
  return (
    <Dialog open onClose={done} label={t("You finished {title}", { title: book.title })} className="sm:max-w-[480px]">
      <div className="scroll flex max-h-[80vh] flex-col items-center px-6 pt-8 pb-2 text-center">
        <motion.div className="w-28" initial={{ y: 14, rotate: -4, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1, transition: { duration: 0.6, ease: EASE } }}>
          <Cover book={book} large className="w-full rounded-[4px] shadow-[var(--shadow-book-hover)]" />
        </motion.div>
        <p className="mt-5 text-caption text-muted">{t("You finished")}</p>
        <h2 className="serif mt-1 text-[24px] leading-tight font-medium tracking-[-0.01em]" style={{ textWrap: "balance" }}>{book.title}</h2>
        <p className="mt-1 text-label text-muted">{authorsOf(book)}</p>
        {facts.length > 0 && <p className="mt-2 text-caption text-muted">{facts.join(", ")}</p>}
        <div className="mt-5 flex flex-col items-center gap-1.5">
          <span className="text-caption text-muted">{t("What did you think?")}</span>
          <Stars value={book.rating} onChange={(rating) => patchBooks([book.id], () => ({ rating }))} />
        </div>
        {next && (
          <div className="mt-6 w-full">
            <p className="mb-2 text-caption text-muted">{t("Next in {series}", { series: book.series ?? "" })}</p>
            <Button variant="primary" className="w-full" onClick={() => open(next.id)}>{t("Read {title}", { title: next.title })}</Button>
          </div>
        )}
        <div className="mt-6 w-full text-left empty:hidden">
          <p className="mb-1 text-caption text-muted">{next ? t("Or something else") : t("What to read next")}</p>
          <Kindred book={book} limit={3} onOpen={open} except={next?.id} />
        </div>
      </div>
      <div className="flex justify-end gap-2 p-5 pt-3">
        <Button variant="ghost" onClick={done}>{t("Keep reading")}</Button>
        <Button variant="secondary" onClick={leave}>{t("Back to my books")}</Button>
      </div>
    </Dialog>
  );
}
