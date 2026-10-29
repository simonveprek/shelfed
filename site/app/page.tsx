import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferHorizontalIcon, ArrowDown01Icon, Globe02Icon, GithubIcon, Idea01Icon, PaintBoardIcon, Refresh01Icon,
  WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons";
import { Clip } from "@/components/clip";
import { DownloadButton, DownloadCards } from "@/components/download";
import { Mark } from "@/components/mark";
import { AppWindow } from "@/components/window";
import { REPO } from "@/lib";

/* ------------------------------------------------------------------------ */
/* The page, in the order a visitor asks: what is it, does it do my job,    */
/* does it work with my Kindle, is it safe, where do I get it.              */
/* ------------------------------------------------------------------------ */

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Formats />
        <Library />
        <Reading />
        <Kindle />
        <Extras />
        <Privacy />
        <Questions />
        <Get />
      </main>
      <Footer />
    </>
  );
}

const width = "mx-auto w-full max-w-[1160px] px-5 sm:px-8";

function Nav() {
  const links = [
    ["Library", "#library"],
    ["Reading", "#reading"],
    ["Kindle", "#kindle"],
    ["Questions", "#questions"],
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150">
      <nav className={`${width} flex h-16 items-center gap-6`}>
        <a href="#top" className="flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.03em]">
          <Mark size={22} />
          shelf
        </a>
        <div className="hidden flex-1 items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="rounded-full px-3 py-1.5 text-[14px] text-muted transition-colors hover:bg-control hover:text-foreground">
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a href={REPO} aria-label="Source on GitHub" className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-control hover:text-foreground">
            <HugeiconsIcon icon={GithubIcon} size={18} />
          </a>
          <a href="#download" className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[14px] font-medium text-background">
            Download
          </a>
        </div>
      </nav>
    </header>
  );
}

/** What it is, for whom, and the app itself moving. */
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* A little aurora behind the window, the colour of the leaning spine. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[38%] -z-10 mx-auto h-[620px] max-w-[1100px] opacity-60 blur-[90px] dark:opacity-40"
        style={{ background: "radial-gradient(45% 50% at 25% 50%, rgb(43 75 255 / 0.35), transparent), radial-gradient(40% 50% at 75% 55%, rgb(255 45 85 / 0.28), transparent), radial-gradient(35% 45% at 55% 35%, rgb(162 59 255 / 0.25), transparent)" }}
      />
      <div className={`${width} flex flex-col items-center pt-20 pb-10 text-center sm:pt-28`}>
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-[13px] text-muted">
          <span className="size-1.5 rounded-full bg-success" />
          Free and open source, for Mac and Windows
        </p>
        <h1 className="max-w-[14ch] text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.98] font-medium tracking-[-0.045em]">
          A quiet home for your <span className="font-serif font-normal italic tracking-[-0.02em]">books</span>.
        </h1>
        <p className="mt-6 max-w-[34rem] text-[clamp(1.05rem,1.6vw,1.2rem)] leading-relaxed text-muted">
          Shelf keeps your ebooks as plain files, reads every common format, and sends them to your Kindle. No account, no subscription, nothing else to install.
        </p>
        <div className="mt-9">
          <DownloadButton />
        </div>
      </div>
      <div className={`${width} pb-16 sm:pb-24`}>
        <AppWindow aura className="mx-auto max-w-[1040px]">
          <Clip name="views" label="Shelf switching a library between covers, a list, shelves and a 3D bookcase" />
        </AppWindow>
      </div>
    </section>
  );
}

/** Answers the first question anyone with a pile of ebooks has. */
function Formats() {
  const formats = ["EPUB", "MOBI", "AZW3", "FB2", "PDF", "CBZ", "Word", "Markdown", "HTML", "Text"];
  return (
    <section className="border-y border-border bg-well">
      <div className={`${width} flex flex-col items-center gap-4 py-8 lg:flex-row lg:justify-center lg:gap-6`}>
        <p className="shrink-0 text-[14px] text-muted">Opens all of these</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {formats.map((format) => (
            <li key={format} className="rounded-full border border-border bg-card px-3 py-1 font-mono text-[12.5px] text-muted">
              {format}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One of the three jobs: words on one side, the app doing it on the other. */
function Job({ id, eyebrow, title, children, points, media, flip = false }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode; points: string[]; media: ReactNode; flip?: boolean }) {
  return (
    <section id={id} className="py-20 sm:py-28">
      <div className={`${width} grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16`}>
        <div className={flip ? "lg:order-2" : ""}>
          <p className="text-[13px] font-medium tracking-wide text-muted uppercase">{eyebrow}</p>
          <h2 className="mt-3 text-[clamp(2rem,4vw,2.9rem)] leading-[1.05] font-medium tracking-[-0.035em]">{title}</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-muted">{children}</p>
          <ul className="mt-7 flex flex-col gap-3.5">
            {points.map((point) => (
              <li key={point} className="flex gap-3 text-[15px] leading-snug">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-foreground/40" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className={flip ? "lg:order-1" : ""}>{media}</div>
      </div>
    </section>
  );
}

function Library() {
  return (
    <Job
      id="library"
      eyebrow="Your library"
      title="Every book where you can see it."
      points={[
        "Plain files in a folder for each author, readable with or without Shelf.",
        "Covers, publishers and descriptions found for you, from Open Library and Google Books.",
        "Collections, ratings, favourites, and search that finds a book by any word of it.",
      ]}
      media={
        <AppWindow>
          <Clip name="bookcase" label="The 3D bookcase changing from oak to slate to walnut" />
        </AppWindow>
      }
    >
      Covers, a list, shelves by author or series, or a bookcase in oak, walnut or slate that leans toward you. Spines take their cover's colour, and a ribbon marks every book you're partway through.
    </Job>
  );
}

function Reading() {
  return (
    <Job
      id="reading"
      flip
      eyebrow="Reading"
      title={
        <>
          Opens where you <span className="font-serif font-normal italic">stopped</span>.
        </>
      }
      points={[
        "Highlights and notes, kept with the book and easy to copy out.",
        "Light, sepia, dark or black pages, in the type and margins you like.",
        "The same reader for every format, PDFs and comics included.",
      ]}
      media={
        <AppWindow>
          <Clip name="reader" label="Turning the pages of Pride and Prejudice in Shelf's reader" />
        </AppWindow>
      }
    >
      A reader made for long evenings. Pages turn like pages, the words sit where you want them, and every book picks up exactly where you left it.
    </Job>
  );
}

function Kindle() {
  return (
    <section id="kindle" className="border-y border-border bg-well py-20 sm:py-28">
      <div className={width}>
        <div className="mx-auto max-w-[44rem] text-center">
          <p className="text-[13px] font-medium tracking-wide text-muted uppercase">Kindle</p>
          <h2 className="mt-3 text-[clamp(2rem,4vw,2.9rem)] leading-[1.05] font-medium tracking-[-0.035em]">It knows your Kindle by name.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-muted">
            Plug a Kindle in and Shelf tells which one it is from its serial number, from a Kindle 2 to a Colorsoft, and shows it in 3D, in its own colour.
          </p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <figure>
            <AppWindow>
              <Clip name="kindle-plug" label="A Kindle being plugged in, the window's edges lighting up" />
            </AppWindow>
            <figcaption className="mt-4 text-[15px] text-muted">
              <span className="text-foreground">Plugged in,</span> it rises over your library and settles in the side panel.
            </figcaption>
          </figure>
          <figure>
            <AppWindow>
              <Clip name="kindle-drop" label="A book dragged from the library onto the Kindle and copied across" />
            </AppWindow>
            <figcaption className="mt-4 text-[15px] text-muted">
              <span className="text-foreground">Drop a book on it</span> and it goes across by cable, made into a Kindle file first if it needs one.
            </figcaption>
          </figure>
        </div>
        <div className="mx-auto mt-12 grid max-w-[60rem] gap-4 sm:grid-cols-3">
          {[
            ["By cable", "For Kindles that show up as a drive when plugged in, most models before 2024."],
            ["By email", "From your own mail account to your Kindle's address, for any Kindle, anywhere."],
            ["Highlights back", "What you marked on your Kindle comes into the books in Shelf, from My Clippings."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[18px] border border-border bg-card p-5">
              <h3 className="text-[15px] font-medium">{title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Worth a line each, not a section. */
function Extras() {
  const extras = [
    { icon: ArrowDataTransferHorizontalIcon, title: "Converts, built in", text: "EPUB, AZW3 for Kindle, PDF, Word, FB2, plain text and web pages, with nothing else to install." },
    { icon: Globe02Icon, title: "Free classics", text: "Thousands of books from Standard Ebooks and Project Gutenberg, a click each." },
    { icon: Idea01Icon, title: "What to read next", text: "Read Jane Eyre? Try Wuthering Heights. Worked out on your computer, from what you own." },
    { icon: PaintBoardIcon, title: "Make it yours", text: "Light or dark, eight app icons, and a bookcase in the wood you like." },
    { icon: WifiDisconnected01Icon, title: "Works offline", text: "Reading, sorting, converting and copying to your Kindle need no connection." },
    { icon: Refresh01Icon, title: "Keeps itself current", text: "Updates install on restart on Windows. On a Mac, Shelf tells you and links to the new version." },
  ];
  return (
    <section className="py-20 sm:py-28">
      <div className={width}>
        <h2 className="max-w-[20ch] text-[clamp(2rem,4vw,2.9rem)] leading-[1.05] font-medium tracking-[-0.035em]">And the things you'd hope for.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-[22px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {extras.map((extra) => (
            <div key={extra.title} className="bg-card p-7">
              <span className="grid size-10 place-items-center rounded-[12px] bg-control">
                <HugeiconsIcon icon={extra.icon} size={19} />
              </span>
              <h3 className="mt-5 text-[16px] font-medium">{extra.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{extra.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Exactly what leaves the computer, and when. People with private libraries ask. */
function Privacy() {
  const online = [
    ["Looking up a book's details", "Open Library and Google Books, when you ask."],
    ["Downloading a free classic", "Standard Ebooks or Project Gutenberg."],
    ["Sending to your Kindle", "Through your own mail server, to Amazon."],
    ["Checking for updates", "GitHub, now and then. You can turn it off."],
  ];
  return (
    <section id="privacy" className="border-y border-border bg-well py-20 sm:py-28">
      <div className={`${width} grid gap-12 lg:grid-cols-2 lg:gap-16`}>
        <div>
          <p className="text-[13px] font-medium tracking-wide text-muted uppercase">Private</p>
          <h2 className="mt-3 text-[clamp(2rem,4vw,2.9rem)] leading-[1.05] font-medium tracking-[-0.035em]">Your books stay yours.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-muted">
            No account and no tracking. Your books, your reading, your highlights and what Shelf suggests all stay on your computer. Your mail password is kept encrypted by
            your system.
          </p>
        </div>
        <div className="rounded-[22px] border border-border bg-card p-2">
          <p className="px-4 pt-4 pb-2 text-[14px] text-muted">Shelf goes online only for these, and only when you ask:</p>
          <ul className="divide-y divide-border">
            {online.map(([what, where]) => (
              <li key={what} className="flex flex-col gap-0.5 px-4 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="text-[15px] font-medium">{what}</span>
                <span className="text-[14px] text-muted sm:text-right">{where}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** The honest answers, before anyone has to ask on GitHub. */
function Questions() {
  const questions: Array<[string, ReactNode]> = [
    ["Is it really free?", "Yes. Shelf is open source under the MIT licence. There's no paid version, no account and nothing to subscribe to."],
    [
      "Which Kindles does it work with?",
      "Every Kindle, by email. By cable, Kindles that show up as a drive when you plug them in, which is most made before 2024. Newer ones, like the 2024 Paperwhite and the Colorsoft, connect the way phones do, and Shelf can't copy to them by cable yet, so it sends to them by email.",
    ],
    ["Can it open books I bought on Amazon?", "Not if they have DRM, as most do. Shelf doesn't remove DRM. Books without it, from anywhere, open fine."],
    [
      "I use Calibre. Can I bring my library?",
      "Drop your Calibre library folder onto Shelf and every book comes in, with the details stored inside each file. The tags, shelves and custom columns you made in Calibre don't come across yet.",
    ],
    ["Where are my books kept?", "In a Shelf Library folder in your Documents, one folder for each author, as ordinary files. You can move it anywhere from Settings."],
    [
      "Why does my computer warn me when I open it?",
      "Shelf isn't signed with a paid developer certificate yet. On a Mac, right-click Shelf in Applications and choose Open the first time. On Windows, choose More info, then Run anyway.",
    ],
    ["Is there a Linux version?", "Not as a download yet. Shelf runs on Linux built from its source, with Node.js."],
  ];
  return (
    <section id="questions" className="py-20 sm:py-28">
      <div className={`${width} grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16`}>
        <h2 className="text-[clamp(2rem,4vw,2.9rem)] leading-[1.05] font-medium tracking-[-0.035em]">Questions, answered straight.</h2>
        <div className="divide-y divide-border border-y border-border">
          {questions.map(([question, answer]) => (
            <details key={question} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 text-[16.5px] font-medium">
                {question}
                <HugeiconsIcon icon={ArrowDown01Icon} size={18} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="max-w-[44rem] pb-6 text-[15.5px] leading-relaxed text-muted">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Get() {
  return (
    <section id="download" className="border-t border-border bg-well py-20 sm:py-28">
      <div className={`${width} grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16`}>
        <div>
          <h2 className="text-[clamp(2.2rem,4.5vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.04em]">
            Bring your books <span className="aurora-text">home</span>.
          </h2>
          <p className="mt-5 max-w-[26rem] text-[17px] leading-relaxed text-muted">Free, and yours to keep. Open it, drop your books on the window, and they're in.</p>
          <a href={REPO} className="mt-8 inline-flex items-center gap-2 text-[15px] text-muted underline decoration-line-strong underline-offset-4 hover:text-foreground">
            <HugeiconsIcon icon={GithubIcon} size={17} />
            Or build it from the source
          </a>
        </div>
        <DownloadCards />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className={`${width} flex flex-col gap-6 py-10 text-[14px] text-muted sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-center gap-2.5 text-foreground">
          <Mark size={18} />
          <span className="font-serif text-[15px] italic">A quiet home for your books.</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a href={REPO} className="hover:text-foreground">Source</a>
          <a href={`${REPO}/blob/main/LICENSE`} className="hover:text-foreground">Licence</a>
          <a href="https://fragms.simonveprek.cz" className="hover:text-foreground">Built on Fragms</a>
          <span>
            Made by{" "}
            <a href="https://simonveprek.cz" className="text-foreground underline decoration-line-strong underline-offset-4">
              Šimon Vepřek
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
