import { memo, useState, type CSSProperties } from "react";
import type { Book } from "../../../shared/types";
import { cx } from "@/components/ui";
import { spineOf } from "@/lib/spine";
import { useStore } from "@/lib/store";
import { authorsOf, coverUrl, thumbUrl } from "@/lib/util";

/** A cover set from the title, in the colour its spine has on the shelf, for books that come without one. */
function PlainCover({ book, small }: { book: Book; small?: boolean }) {
  const style = useStore((s) => s.settings.bookcase.spines);
  const { base, ink } = spineOf(book, style);
  // A spine is a sliver of colour; a whole cover of it is loud, so unless someone picked it, it's quietened.
  const background = book.spine || base.startsWith("color-mix") ? base : `color-mix(in oklab, ${base} 62%, #35322d)`;
  return (
    <div className="absolute inset-0 flex flex-col" style={{ containerType: "inline-size", background, color: ink }}>
      <div className="m-[8%] flex flex-1 flex-col items-center justify-center rounded-[6px] border border-current/25 px-[8%] text-center">
        <div className="serif line-clamp-5 leading-[1.12] font-medium" style={{ fontSize: small ? "11cqw" : "min(11cqw, 28px)", textWrap: "balance" }}>
          {book.title}
        </div>
        <div className="my-[9%] h-px w-[26%] bg-current opacity-30" />
        <div className="line-clamp-2 opacity-75" style={{ fontSize: small ? "7cqw" : "min(7cqw, 15px)" }}>
          {authorsOf(book)}
        </div>
      </div>
      <div className="pb-[6%] text-center font-mono tracking-[0.18em] uppercase opacity-60" style={{ fontSize: "5cqw" }}>
        {book.formats[0]?.ext}
      </div>
    </div>
  );
}

/** A book's cover, real or set from its title, at any size. */
export const Cover = memo(function Cover({
  book,
  large,
  className,
  style,
}: {
  book: Book;
  large?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const has = book.cover > 0 && !failed;
  return (
    <div
      className={cx("relative aspect-[2/3] overflow-hidden rounded-[6px] bg-control", className)}
      style={{ background: has && !loaded ? book.tint : undefined, ...style }}
    >
      {has ? (
        <img
          src={large ? coverUrl(book) : thumbUrl(book)}
          alt=""
          draggable={false}
          decoding="async"
          loading="lazy"
          data-loaded={loaded}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="cover-img absolute inset-0 size-full object-cover"
        />
      ) : (
        <PlainCover book={book} small={!large} />
      )}
      {/* A spine shadow and a hairline edge, so every cover reads as a book. */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: "linear-gradient(90deg, rgb(0 0 0 / 0.14) 0, rgb(255 255 255 / 0.1) 1.5%, transparent 4%)",
          boxShadow: "inset 0 0 0 0.5px rgb(0 0 0 / 0.12)",
        }}
      />
    </div>
  );
});
