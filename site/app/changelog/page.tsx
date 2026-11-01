import type { Metadata } from "next";
import { Mark } from "@/components/mark";
import { RELEASES_MADE } from "@/changelog";
import { asset, REPO } from "@/lib";

export const metadata: Metadata = {
  title: "What's new in Shelfed",
  description: "What changed in each version of Shelfed, a free, open-source ebook library for Mac and Windows.",
  alternates: { canonical: "/changelog/" },
};

const when = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function Changelog() {
  return (
    <div className="mx-auto max-w-[680px] px-5 py-10 sm:px-8 sm:py-14">
      <a href={asset("")} className="inline-flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.03em]">
        <Mark size={22} />
        shelfed
      </a>
      <h1 className="mt-14 font-serif text-[40px] leading-tight tracking-[-0.02em] sm:text-[48px]">What&apos;s new</h1>
      <p className="mt-3 text-[16px] text-muted">What changed in each version of Shelfed.</p>
      <main className="mt-14 flex flex-col gap-16">
        {RELEASES_MADE.map((release) => (
          <article key={release.version} id={`v${release.version}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[22px] font-medium tracking-[-0.02em]">{release.version}</h2>
              <time dateTime={release.date} className="text-[14px] text-muted">{when(release.date)}</time>
            </div>
            <p className="mt-2 font-serif text-[20px] leading-snug">{release.summary}</p>
            <ul className="mt-4 flex list-disc flex-col gap-2.5 pl-5 text-[15.5px] leading-relaxed text-muted marker:text-line-strong">
              {release.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </article>
        ))}
      </main>
      <footer className="mt-20 flex flex-wrap gap-5 border-t border-border pt-6 text-[13.5px] text-muted">
        <a href={asset("")} className="hover:text-foreground">Home</a>
        <a href={`${REPO}/releases`} className="hover:text-foreground">Every download</a>
        <a href={REPO} className="hover:text-foreground">Source</a>
      </footer>
    </div>
  );
}
