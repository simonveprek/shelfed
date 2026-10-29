import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { DownloadButton, OtherBuilds } from "@/components/download";
import { Mark } from "@/components/mark";
import { Scene } from "@/components/scene";
import { REPO } from "@/lib";

/*
 * One scene carries the page: the app's window pinned while its story
 * scrolls past. After it, only what a visitor still needs: why it's safe to
 * try, where to get it, and the few honest caveats.
 */
export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Scene />
        <Why />
        <Get />
        <FinePrint />
      </main>
      <Footer />
    </>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-background via-background/80 to-transparent">
      <nav className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <a href="#" className="flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.03em]">
          <Mark size={22} />
          shelf
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
  const reasons = [
    ["Free and open source.", "No account, no subscription, no paid version."],
    ["Your books stay yours.", "Plain files on your computer. Nothing is tracked, and Shelf only goes online when you ask."],
    ["Nothing else to install.", "Reading, converting and sending to your Kindle are all built in."],
  ];
  return (
    <section className="mx-auto max-w-[1080px] px-5 py-28 sm:px-8 sm:py-40">
      <div className="grid gap-12 sm:grid-cols-3 sm:gap-10">
        {reasons.map(([title, text]) => (
          <div key={title}>
            <h3 className="text-[clamp(1.35rem,2.2vw,1.65rem)] leading-tight font-medium tracking-[-0.03em]">{title}</h3>
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

/** The honest caveats, small but there before anyone has to ask. */
function FinePrint() {
  const notes = [
    ["Kindles from 2024 on", "connect like phones, not drives, so Shelf sends to them by email for now. Older Kindles also take books by cable."],
    ["Books with DRM", "won't open, and Shelf doesn't remove it. Books without DRM, from anywhere, open fine."],
    ["The first time you open it", "your computer warns you, as Shelf isn't signed yet. On a Mac, right-click it and choose Open; on Windows, More info, then Run anyway."],
    ["Coming from Calibre?", "Drop its library folder on Shelf and the books come in. Calibre's own tags and shelves don't, yet."],
  ];
  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-24 sm:px-8">
      <div className="grid gap-x-10 gap-y-6 border-t border-border pt-10 sm:grid-cols-2">
        {notes.map(([lead, rest]) => (
          <p key={lead} className="text-[14px] leading-relaxed text-muted">
            <span className="text-foreground">{lead}</span> {rest}
          </p>
        ))}
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
