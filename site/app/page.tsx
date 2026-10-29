import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferHorizontalIcon, BookOpen01Icon, FileExportIcon, FileImportIcon, GithubIcon, Globe02Icon, LibraryIcon, PackageIcon,
  PaintBoardIcon, SourceCodeIcon, SquareLock02Icon, Tablet01Icon,
} from "@hugeicons/core-free-icons";
import { DownloadButton, OtherBuilds } from "@/components/download";
import { Mark } from "@/components/mark";
import { Scene } from "@/components/scene";
import { Schema } from "@/components/schema";
import { GROUPS, MAKES, OPENS, QUESTIONS, REASONS } from "@/content";
import { REPO } from "@/lib";

/*
 * One scene carries the page: the app's window pinned while its story
 * scrolls past. After it, the detail for those who want it: why it's safe to
 * try, everything it does, the files it handles, where to get it, and the
 * honest answers.
 */
export default function Home() {
  return (
    <>
      <Schema />
      <Nav />
      <main>
        <Scene />
        <Why />
        <Everything />
        <Formats />
        <Get />
        <Questions />
      </main>
      <Footer />
    </>
  );
}

/** An icon on a soft square, the way the app's settings show theirs. */
function Tile({ icon, small = false }: { icon: typeof LibraryIcon; small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center bg-control text-foreground ${small ? "size-8 rounded-[10px]" : "size-11 rounded-[13px]"}`}>
      <HugeiconsIcon icon={icon} size={small ? 16 : 20} />
    </span>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-background via-background/80 to-transparent">
      <nav className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <a href="#" className="flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.03em]">
          <Mark size={22} />
          shelfed
        </a>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/70 p-1 backdrop-blur-xl">
          <a href={REPO} aria-label="Source on GitHub" className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-control hover:text-foreground">
            <HugeiconsIcon icon={GithubIcon} size={17} />
          </a>
          <a href="#download" className="inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[13.5px] font-medium text-background">
            Download
          </a>
        </div>
      </nav>
    </header>
  );
}

/** Three reasons to try it, each said once. */
function Why() {
  const icons = [SourceCodeIcon, SquareLock02Icon, PackageIcon];
  return (
    <section aria-labelledby="why" className="mx-auto max-w-[1080px] px-5 py-28 sm:px-8 sm:py-40">
      <h2 id="why" className="sr-only">Why it's safe to try</h2>
      <div className="grid gap-12 sm:grid-cols-3 sm:gap-10">
        {REASONS.map(([title, text], i) => (
          <div key={title}>
            <Tile icon={icons[i]} />
            <h3 className="mt-6 text-[clamp(1.35rem,2.2vw,1.65rem)] leading-tight font-medium tracking-[-0.03em]">{title}</h3>
            <p className="mt-3 text-[15.5px] leading-relaxed text-muted">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Get() {
  return (
    <section id="download" className="relative overflow-hidden border-t border-border px-5 py-28 text-center sm:py-36">
      {/* The aurora, faint, rising behind the last call. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-1/2 -z-10 mx-auto h-[640px] max-w-[900px] opacity-50 blur-[100px] dark:opacity-35"
        style={{ background: "radial-gradient(40% 50% at 30% 50%, rgb(43 75 255 / 0.4), transparent), radial-gradient(40% 50% at 70% 50%, rgb(255 45 85 / 0.32), transparent)" }}
      />
      <span className="inline-flex">
        <Mark size={44} />
      </span>
      <h2 className="mx-auto mt-8 max-w-[16ch] text-[clamp(2.2rem,5vw,3.75rem)] leading-[1] font-medium tracking-[-0.045em]">
        Bring your books <span className="font-serif font-normal italic tracking-[-0.02em]">home</span>.
      </h2>
      <p className="mx-auto mt-5 max-w-[26rem] text-[16.5px] leading-relaxed text-muted">Open it, drop your books on the window, and they're in.</p>
      <div className="mt-9 flex justify-center">
        <DownloadButton center />
      </div>
      <div className="mt-10">
        <OtherBuilds />
      </div>
    </section>
  );
}

/** Everything Shelfed does, grouped, for the visitor who reads to the end before trying. */
function Everything() {
  const icons = [LibraryIcon, BookOpen01Icon, Tablet01Icon, ArrowDataTransferHorizontalIcon, Globe02Icon, PaintBoardIcon];
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-[1080px] px-5 py-24 sm:px-8 sm:py-32">
        <h2 className="max-w-[18ch] text-[clamp(2rem,4vw,3rem)] leading-[1.02] font-medium tracking-[-0.04em]">Everything in it.</h2>
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map(([title, items], i) => (
            <div key={title} className="border-t border-border pt-5">
              <h3 className="flex items-center gap-3 text-[15px] font-medium">
                <Tile icon={icons[i]} small />
                {title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {items.map((item) => (
                  <li key={item} className="text-[14.5px] leading-snug text-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** What it takes in and what it gives back, the first question of anyone with a pile of ebooks. */
function Formats() {
  const rows: Array<[typeof FileImportIcon, string, string[]]> = [
    [FileImportIcon, "Opens", OPENS],
    [FileExportIcon, "Makes", MAKES],
  ];
  return (
    <section className="border-t border-border bg-well">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-5 py-14 sm:px-8">
        {rows.map(([icon, label, formats]) => (
          <div key={label} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
            <span className="flex w-28 shrink-0 items-center gap-2.5 text-[14px] font-medium">
              <HugeiconsIcon icon={icon} size={17} className="text-muted" />
              {label}
            </span>
            <ul className="flex flex-wrap gap-2">
              {formats.map((format) => (
                <li key={format} className="rounded-full border border-border bg-card px-3 py-1 font-mono text-[12.5px] text-muted">
                  {format}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The honest answers, all open, before anyone has to ask. */
function Questions() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-[1080px] px-5 py-24 sm:px-8 sm:py-28">
        <h2 className="text-[clamp(2rem,4vw,3rem)] leading-[1.02] font-medium tracking-[-0.04em]">Good to know.</h2>
        <dl className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          {QUESTIONS.map(([question, answer]) => (
            <div key={question}>
              <dt className="text-[15.5px] font-medium">{question}</dt>
              <dd className="mt-2 text-[14.5px] leading-relaxed text-muted">{answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4 px-5 py-8 text-[13.5px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>
          Made by{" "}
          <a href="https://simonveprek.cz" className="text-foreground underline decoration-line-strong underline-offset-4">
            Šimon Vepřek
          </a>
          , on{" "}
          <a href="https://fragms.simonveprek.cz" className="underline decoration-line-strong underline-offset-4 hover:text-foreground">
            Fragms
          </a>
          .
        </span>
        <span className="flex gap-5">
          <a href={REPO} className="hover:text-foreground">Source</a>
          <a href={`${REPO}/blob/main/LICENSE`} className="hover:text-foreground">MIT licence</a>
        </span>
      </div>
    </footer>
  );
}
