import { useMemo, useState } from "react";
import { Button, SearchField, toast } from "@/components/ui";
import { Empty } from "@/components/bits";
import { openReaderAt } from "@/lib/actions";
import { commonplaceMarkdown, gatherHighlights } from "@/lib/commonplace";
import { useStore } from "@/lib/store";
import { authorsOf } from "@/lib/util";
import { Cover } from "./Cover";
import type { Annotation, Book } from "../../../shared/types";
import { t, tn } from "../../../shared/i18n";

const MARK: Record<NonNullable<Annotation["color"]>, string> = { yellow: "#d9b43a", green: "#5aa469", blue: "#5b8def", pink: "#d97ba3" };

function Line({ book, line }: { book: Book; line: Annotation }) {
  // A place in the file it was made in; Kindle's own highlights have none Shelfed can open.
  const place = line.cfi && line.ext !== "pdf";
  const body = (
    <>
      {line.text && (
        <p className="selectable serif border-l-2 pl-4 text-[17px] leading-relaxed" style={{ borderColor: MARK[line.color ?? "yellow"] }}>
          {line.text}
        </p>
      )}
      {line.note && <p className="selectable mt-2 pl-4 text-label text-muted">{line.note}</p>}
    </>
  );
  return (
    <div>
      {body}
      <p className="mt-1.5 flex items-center gap-3 pl-4 text-caption text-muted">
        {(line.chapter || line.where) && <span>{line.chapter ?? line.where}</span>}
        {place && (
          <button className="font-medium text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground" onClick={() => openReaderAt(book.id, line.cfi!, line.ext)}>
            {t("Open here")}
          </button>
        )}
      </p>
    </div>
  );
}

/** Every line marked in every book, like the notebook readers used to keep. */
export function Commonplace() {
  const books = useStore((s) => s.books);
  const [query, setQuery] = useState("");
  const entries = useMemo(() => gatherHighlights(books, query), [books, query]);
  const anything = useMemo(() => gatherHighlights(books).length > 0, [books]);
  const count = entries.reduce((n, e) => n + e.highlights.length, 0);
  return (
    <div className="scroll h-full">
      <div className="mx-auto max-w-[720px] px-6 pt-8 pb-24">
        <h2 className="serif text-[32px] leading-tight font-medium tracking-[-0.015em]">{t("Your commonplace book")}</h2>
        <p className="mt-2 text-label text-muted">{t("Every line you've marked, from every book, in one quiet place.")}</p>
        {anything && (
          <div className="mt-6 flex items-center gap-3">
            <SearchField placeholder={t("Search what you've marked")} value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1" />
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              disabled={!count}
              onClick={() => {
                navigator.clipboard.writeText(commonplaceMarkdown(entries));
                toast.success(t("Copied as Markdown"));
              }}
            >
              {t("Copy")}
            </Button>
          </div>
        )}
        {!anything ? (
          <div className="mt-12">
            <Empty point={{ shape: "cookie", mood: "curious" }}>
              <p className="text-[15px] font-medium text-foreground">{t("Nothing marked yet")}</p>
              <p className="mt-1">{t("Select words while you read to highlight them, and they gather here. A Kindle's highlights can come in too, from Settings.")}</p>
            </Empty>
          </div>
        ) : !entries.length ? (
          <p className="mt-10 text-center text-label text-muted">{t("Nothing you've marked says that.")}</p>
        ) : (
          <>
            <p className="mt-4 text-caption text-muted">{tn(count, "{n} line", "{n} lines")}</p>
            <div className="mt-6 flex flex-col gap-12">
              {entries.map(({ book, highlights }) => (
                // Far off screen it isn't drawn at all, so a lifetime of highlights stays light.
                <section key={book.id} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 400px" }}>
                  <div className="mb-5 flex items-center gap-3">
                    <Cover book={book} className="w-9 shrink-0 rounded-[3px] shadow-[var(--shadow-book)]" />
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-label font-medium">{book.title}</p>
                      <p className="line-clamp-1 text-caption text-muted">{authorsOf(book)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-6">
                    {highlights.map((line) => (
                      <Line key={line.id} book={book} line={line} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
