import { cx } from "./cx";
import { CopyButton } from "./copy";
import { guessLang, highlight, TOKEN_CLASS, type Lang, type Token } from "./highlight";

/** One line of highlighted code. */
export function CodeLine({ tokens }: { tokens: Token[] }) {
  if (tokens.length === 0) return <>{" "}</>;
  return (
    <>
      {tokens.map((token, i) =>
        token.kind === "plain" ? (
          token.text
        ) : (
          <span key={i} className={TOKEN_CLASS[token.kind]}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
}

/** A snippet with a copy button, highlighted for its language. */
export function CodeBlock({
  code,
  lang,
  file,
  className,
}: {
  code: string;
  /** Guessed from the file name or the code when left out. */
  lang?: Lang;
  file?: string;
  className?: string;
}) {
  const lines = highlight(code, lang ?? guessLang(code, file));
  return (
    <div className={cx("flex items-start gap-2 rounded-field border border-border bg-well p-3 pl-4", className)}>
      <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] leading-relaxed whitespace-pre text-[var(--code-plain)]">
        {lines.map((tokens, index) => (
          <span key={index} className="block min-h-[1lh]">
            <CodeLine tokens={tokens} />
          </span>
        ))}
      </pre>
      <CopyButton value={code} />
    </div>
  );
}
