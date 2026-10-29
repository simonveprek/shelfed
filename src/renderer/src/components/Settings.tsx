import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  ArrowDataTransferHorizontalIcon, BookOpen01Icon, Cancel01Icon, CheckmarkCircle02Icon, Folder01Icon, GithubIcon, Globe02Icon,
  InformationCircleIcon, LicenseIcon, MailSend01Icon, PaintBoardIcon, PlayCircleIcon, Tablet01Icon,
} from "@hugeicons/core-free-icons";
import {
  Badge, Button, cx, Dialog, EASE, Field, Icon, IconButton, Input, Segmented, Select, SwitchRow, TextLink, toast, type IconLike,
} from "@/components/ui";
import { Point } from "@/components/fragms/points";
import { api, isMac, revealLabel } from "@/lib/api";
import { bringCalibreOver, joinCopies } from "@/lib/actions";
import { useCalibre } from "@/lib/findcalibre";
import { fromLocale, LANGUAGES, t, tn, type Language, tc } from "../../../shared/i18n";
import { findCopies } from "../../../shared/copies";
import { chooseIcon, iconSrc } from "@/lib/icon";
import { PHONE_LIKE, useFinishedOnKindle, useKindlePort, useOnKindle } from "@/lib/kindle";
import { hydrate, setSetting, useStore, type SettingsSection } from "@/lib/store";
import { bytes } from "@/lib/util";
import { FINISHES, KINDLES, kindleById } from "../../../shared/kindles";
import { APP_ICONS } from "../../../shared/icons";
import type { UpdateState } from "../../../shared/types";
import { ColourPicker } from "./Colours";
import { Kindle3D } from "./Kindle3D";

/* ------------------------------------------------------------------------ */
/* Pieces                                                                    */
/* ------------------------------------------------------------------------ */

/** A section's title and what it's for, at the top of the page. */
function Title({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[22px] leading-tight font-medium tracking-[-0.02em]">{title}</h2>
      {children && <p className="mt-1.5 max-w-[52ch] text-label text-muted">{children}</p>}
    </div>
  );
}

/** Settings that belong together, in one card, with an optional name over it. */
function Group({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mb-6 last:mb-0", className)}>
      {label && <h3 className="mb-2 px-1 text-caption font-medium text-muted">{label}</h3>}
      <div className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-card">{children}</div>
    </section>
  );
}

/** One setting: what it is on the left, how to change it on the right. */
function Row({ label, hint, children, wrap }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; wrap?: boolean }) {
  return (
    <div className={cx("flex items-center gap-x-6 gap-y-3 px-4 py-3.5", wrap && "flex-wrap")}>
      <div className="min-w-0 flex-1">
        <div className="text-label font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-caption text-muted">{hint}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/** A translated sentence with a link in place of its {link} (or other) placeholder, so the words around it can move. */
function withLink(text: string, link: ReactNode, slot = "{link}") {
  const at = text.indexOf(slot);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      {link}
      {text.slice(at + slot.length)}
    </>
  );
}

/** A choice drawn as a picture, with its name under it. */
function Choice({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="group flex flex-col items-center gap-2 rounded-[14px] outline-none">
      <span
        className={cx(
          "relative flex w-full items-center justify-center overflow-hidden rounded-[14px] transition-shadow duration-150",
          on
            ? "shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)]"
            : "shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover:shadow-[inset_0_0_0_1px_var(--line-strong),0_0_0_3px_var(--control)] group-focus-visible:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--line-strong)]",
        )}
      >
        {children}
      </span>
      <span className={cx("text-caption transition-colors duration-150", on ? "font-medium text-foreground" : "text-muted group-hover:text-foreground")}>{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* Library                                                                   */
/* ------------------------------------------------------------------------ */

function LibrarySection() {
  const path = useStore((s) => s.settings.libraryPath);
  const downloads = useStore((s) => s.settings.downloads !== false);
  const books = useStore((s) => s.books);
  const mood = useStore((s) => s.mood);
  const size = useMemo(() => books.reduce((n, b) => n + b.formats.reduce((m, f) => m + f.size, 0), 0), [books]);
  const authors = useMemo(() => new Set(books.flatMap((b) => b.authors)).size, [books]);
  const parts = path.split(/[\\/]/).filter(Boolean);
  return (
    <>
      <Title title={t("Library")}>{t("Your books live in a plain folder, one folder for each author, so they stay yours and readable without Shelfed.")}</Title>
      <Group>
        <div className="flex items-center gap-4 px-4 py-4">
          <Point shape="squircle" mood={mood ?? "idle"} size={44} look="pointer" energy={0.8} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-medium">{parts.at(-1) ?? path}</p>
            <p className="line-clamp-1 text-caption break-all text-muted" title={path}>{path}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => api.revealLibrary()}>{t(revealLabel.replace(/^Show in /, "Open in "))}</Button>
            <Button
              size="sm"
              onClick={async () => {
                const state = await api.moveLibrary();
                if (state) {
                  hydrate(state);
                  toast.success(t("Switched to the new library folder"));
                }
              }}
            >
              {t("Move…")}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {[
            [books.length.toLocaleString(), tn(books.length, "book", "books")],
            [authors.toLocaleString(), tn(authors, "author", "authors")],
            [bytes(size), t("on disk")],
          ].map(([value, label]) => (
            <div key={label} className="px-4 py-3.5">
              <p className="text-[20px] leading-tight font-medium tracking-[-0.02em] tabular-nums">{value}</p>
              <p className="text-caption text-muted">{label}</p>
            </div>
          ))}
        </div>
      </Group>
      <FromCalibre />
      <Group label={t("Downloads")}>
        <div className="px-4 py-1">
          <SwitchRow
            label={t("Add books you download")}
            hint={t("New EPUB, MOBI, AZW3, FB2 and comic files in your Downloads folder come in by themselves while Shelfed is open. PDFs and documents stay where they are.")}
            checked={downloads}
            onChange={(on) => setSetting({ downloads: on })}
          />
        </div>
      </Group>
      <Copies />
      <Group label={t("The first time")}>
        <Row label={t("The welcome")} hint={t("The short story about reading Shelfed opens with.")}>
          <Button size="sm" onClick={() => useStore.setState({ dialog: null, onboarding: true })}>{t("Show it again")}</Button>
        </Row>
      </Group>
    </>
  );
}

/** A Calibre library on this computer, to bring over at any time. */
function FromCalibre() {
  const calibre = useCalibre();
  if (!calibre) return null;
  return (
    <Group label="Calibre">
      <Row
        label={t("Your Calibre library")}
        hint={tn(
          calibre.books,
          "{n} book in {path}. Bring them over, with their formats, covers, series and tags. Calibre's library isn't changed, and books already here are skipped.",
          "{n} books in {path}. Bring them over, with their formats, covers, series and tags. Calibre's library isn't changed, and books already here are skipped.",
          { path: calibre.path },
        )}
      >
        <Button size="sm" onClick={() => bringCalibreOver(calibre.path, calibre.books)}>{t("Bring them over")}</Button>
      </Row>
    </Group>
  );
}

/** Books that are the same book in different files, like an EPUB and a MOBI Calibre kept apart, joined in one go. */
function Copies() {
  const books = useStore((s) => s.books);
  const copies = useMemo(() => findCopies(books).reduce((n, group) => n + group.copies.length, 0), [books]);
  const [busy, setBusy] = useState(false);
  return (
    <Group label={t("Copies")}>
      <Row
        label={t("The same book twice")}
        hint={
          copies
            ? tn(
                copies,
                "{n} book is a copy of another in a different format, with the same title and author. Joined, each becomes one book with both files.",
                "{n} books are copies of another in a different format, with the same title and author. Joined, each becomes one book with both files.",
              )
            : t("No book here is a copy of another in a different format. Books that come in as copies join up by themselves.")
        }
      >
        <Button
          size="sm"
          disabled={!copies || busy}
          onClick={async () => {
            setBusy(true);
            const joined = (await joinCopies().finally(() => setBusy(false))).size;
            toast.success(tn(joined, "Joined {n} copy to its book", "Joined {n} copies to their books"));
          }}
        >
          {busy ? t("Joining…") : copies ? t("Join {n}", { n: copies }) : t("None found")}
        </Button>
      </Row>
    </Group>
  );
}

/* ------------------------------------------------------------------------ */
/* Appearance                                                                */
/* ------------------------------------------------------------------------ */

/** A small window in light or dark, for choosing between them. */
function Window({ dark }: { dark: boolean }) {
  const bg = dark ? "#121212" : "#f7f5f0";
  const panel = dark ? "#1c1c1c" : "#ffffff";
  const line = dark ? "#ffffff1f" : "#0000001a";
  const spines = dark ? ["#3b4e6b", "#7a3434", "#3a6b5e", "#c9a24a"] : ["#2c3e50", "#7a2e2e", "#2f5d50", "#c99a2e"];
  return (
    <span className="flex h-full w-full" style={{ background: bg }}>
      <span className="h-full w-[26%] border-r" style={{ background: panel, borderColor: line }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="mx-[16%] mt-[18%] block h-[5%] rounded-full" style={{ background: line, width: `${56 - i * 10}%` }} />
        ))}
      </span>
      <span className="flex flex-1 items-end gap-[3%] px-[9%] pb-[16%]">
        {spines.map((c, i) => (
          <span key={c} className="block rounded-[1px]" style={{ background: c, width: "13%", height: `${44 + ((i * 13) % 20)}%` }} />
        ))}
      </span>
    </span>
  );
}

/** One app icon to pick, the ring hugging its own tile. */
function IconChoice({ id, label, on }: { id: string; label: string; on: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => chooseIcon(id)} className="group flex flex-col items-center gap-2 outline-none">
      <span
        className={cx(
          "relative block aspect-square w-full overflow-hidden rounded-[22.5%] transition-[box-shadow,transform] duration-200 ease-smooth",
          on
            ? "shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)]"
            : "shadow-[0_4px_12px_rgba(0,0,0,0.14)] group-hover:-translate-y-0.5 group-focus-visible:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--line-strong)]",
        )}
      >
        {/* On macOS the drawing has room around the tile for its shadow; this crops to the tile. */}
        <img src={iconSrc(id)} alt="" draggable={false} className={cx("absolute inset-0 size-full", isMac && "scale-[1.243]")} />
      </span>
      <span className={cx("text-caption transition-colors duration-150", on ? "font-medium text-foreground" : "text-muted group-hover:text-foreground")}>{label}</span>
    </button>
  );
}

/** The language Shelfed speaks: automatic follows the system, so a Czech computer gets Czech. */
function LanguageRow() {
  const setting = useStore((s) => s.settings.language ?? "auto");
  const system = LANGUAGES.find((l) => l.id === fromLocale(navigator.language))?.name ?? "English";
  return (
    <Group>
      <Row label={t("Language")} hint={t("Shelfed speaks your system's language unless you choose one.")}>
        <Select
          label={t("Language")}
          size="sm"
          value={setting}
          onChange={(id) => setSetting({ language: id as "auto" | Language })}
          options={[{ id: "auto", label: t("Automatic ({language})", { language: system }) }, ...LANGUAGES.map((l) => ({ id: l.id, label: l.name }))]}
        />
      </Row>
    </Group>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const current = (theme as "system" | "light" | "dark") ?? "system";
  const chosen = useStore((s) => s.settings.icon ?? "paper");
  return (
    <>
      <Title title={t("Appearance")}>{t("Light, dark, or following your system through the day.")}</Title>
      <LanguageRow />
      <div className="grid grid-cols-3 gap-4">
        {(["system", "light", "dark"] as const).map((id) => (
          <Choice key={id} on={current === id} label={t({ system: "Auto", light: "Light", dark: "Dark" }[id])} onClick={() => setTheme(id)}>
            <span className="aspect-[16/10] w-full">
              {id === "system" ? (
                <span className="relative block h-full w-full">
                  <Window dark={false} />
                  <span className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}>
                    <Window dark />
                  </span>
                </span>
              ) : (
                <Window dark={id === "dark"} />
              )}
            </span>
          </Choice>
        ))}
      </div>
      <h3 className="mt-9 mb-1 text-label font-medium">{t("App icon")}</h3>
      <p className="mb-4 text-caption text-muted">
        {isMac ? t("Shows in the Dock while Shelfed is open.") : t("Shows on the taskbar while Shelfed is open.")}
      </p>
      <div className="grid grid-cols-4 gap-x-8 gap-y-5 px-4">
        {APP_ICONS.map((icon) => (
          <IconChoice key={icon.id} id={icon.id} label={t(icon.label)} on={chosen === icon.id} />
        ))}
      </div>
      <p className="mt-6 text-caption text-muted">{t("The bookcase has its own look, in its menu: shelves, wood, spines and ribbons.")}</p>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                   */
/* ------------------------------------------------------------------------ */

const FACES = {
  publisher: { label: "The book's", family: "var(--font-serif)", note: "As the book sets it" },
  serif: { label: "Serif", family: "var(--font-serif)", note: "" },
  sans: { label: "Sans", family: '"Geist", -apple-system, "Segoe UI", system-ui, sans-serif', note: "" },
} as const;

const SAMPLE =
  "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families.";

function ReadingSection() {
  const reader = useStore((s) => s.settings.reader);
  const set = (patch: Partial<typeof reader>) => setSetting({ reader: { ...useStore.getState().settings.reader, ...patch } });
  return (
    <>
      <Title title={tc("settings", "Reading")}>{t("How books look when you open them. Size, spacing and page colour change from the Aa button while you read.")}</Title>
      {/* The page, as it will look. */}
      <div className="mb-6 rounded-[18px] border border-border bg-[#f7f4ec] px-8 py-6 text-[#1d1b18] shadow-card dark:bg-[#1b1a18] dark:text-[#e9e4d8]">
        <p className="mb-2 text-center text-[11px] tracking-[0.18em] uppercase opacity-50">Chapter 1</p>
        <p
          className="text-[15px] leading-[1.65]"
          style={{ fontFamily: FACES[reader.font].family, textAlign: reader.justify ? "justify" : "left", hyphens: reader.justify ? "auto" : "manual" }}
          lang="en"
        >
          {SAMPLE}
        </p>
      </div>
      <Group label={t("Type")}>
        <div className="grid grid-cols-3 gap-3 p-4">
          {(Object.keys(FACES) as Array<keyof typeof FACES>).map((id) => (
            <Choice key={id} on={reader.font === id} label={t(FACES[id].label)} onClick={() => set({ font: id })}>
              <span className="flex h-[72px] w-full flex-col items-center justify-center bg-well">
                <span className="text-[30px] leading-none" style={{ fontFamily: FACES[id].family, fontStyle: id === "publisher" ? "italic" : undefined }}>
                  Aa
                </span>
              </span>
            </Choice>
          ))}
        </div>
        <div className="px-4 py-1">
          <SwitchRow label={t("Justify text")} hint={t("Even edges on both sides, with hyphens.")} checked={reader.justify} onChange={(justify) => set({ justify })} />
        </div>
      </Group>
      <Group label={t("Turning pages")}>
        <Row label={t("Page turns")} hint={reader.flow === "paginated" ? t("One page at a time, like a book.") : t("One long page, like the web.")}>
          <Segmented
            label={t("Page turns")}
            size="sm"
            value={reader.flow}
            onChange={(flow) => set({ flow })}
            options={[{ id: "paginated", label: t("Pages") }, { id: "scrolled", label: t("Scroll") }]}
          />
        </Row>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Kindle                                                                    */
/* ------------------------------------------------------------------------ */

function KindleSection() {
  const kindle = useStore((s) => s.settings.kindle);
  const books = useStore((s) => s.books);
  const found = useKindlePort()?.usb ?? null;
  const model = kindleById(kindle.model);
  const finish = model && kindle.finish && model.finishes.includes(kindle.finish) ? kindle.finish : model?.finishes[0];
  const reading = books.filter((b) => b.status === "reading").sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0))[0];
  const plugged = found?.find((k) => k.model === model?.id);
  const cable = useStore((s) => s.kindleCable);
  const copied = useOnKindle()?.size ?? 0;
  const finished = useFinishedOnKindle();
  const stranger = Boolean(found?.length) && !found?.some((k) => k.model);
  const set = (patch: Partial<typeof kindle>) => setSetting({ kindle: { ...useStore.getState().settings.kindle, ...patch } });
  // Settings steps aside first, so the welcome has the whole window.
  const plugIn = () => {
    useStore.setState({ dialog: null });
    setTimeout(() => useStore.setState({ kindleArrived: Date.now() }), 300);
  };

  return (
    <>
      <Title title={t("Kindle")}>{t("Plug your Kindle in and Shelfed recognises it. Or pick it here, and choose its colour.")}</Title>
      <div className="mb-6 flex flex-wrap items-center gap-8 rounded-[18px] border border-border bg-well px-7 py-7">
        <div className="flex w-[190px] shrink-0 justify-center">
          {model ? (
            <Kindle3D model={model} finish={finish} book={reading} height={model.size[1] > 200 ? 220 : 200} />
          ) : (
            <div className="flex h-[200px] w-[140px] items-center justify-center rounded-[16px] border border-dashed border-line-strong p-4 text-center text-caption text-muted">
              {t("Plug it in, or pick it from the list")}
            </div>
          )}
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-4">
          <div>
            <p className="text-[20px] leading-tight font-medium tracking-[-0.02em]">{model?.name ?? t("Not known yet")}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-muted">
              {model && <span>{t(model.colour ? "{year}, {size}″ colour screen" : "{year}, {size}″ screen", { year: String(model.year), size: model.screen })}</span>}
              {plugged && <Badge tone="success">{t("Plugged in")}</Badge>}
              {stranger && <Badge>{t("A Kindle Shelfed doesn't know is plugged in")}</Badge>}
              {copied > 0 && <span>{tn(copied, "{n} of your books is on it.", "{n} of your books are on it.")}</span>}
            </p>
            {cable === "phone" && <p className="mt-2 max-w-[44ch] text-caption text-muted">{t(PHONE_LIKE)}</p>}
            {finished && finished.books.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-caption text-muted">
                  {tn(
                    finished.books.length,
                    "{n} book you've finished is still on it, using {size}.",
                    "{n} books you've finished are still on it, using {size}.",
                    { size: bytes(finished.bytes) },
                  )}
                </p>
                <Button size="sm" onClick={() => useStore.setState({ confirmTidy: true })}>{t("Take them off")}</Button>
              </div>
            )}
          </div>
          <Select
            label={t("Model")}
            size="sm"
            value={kindle.model ?? ""}
            onChange={(id) => {
              const picked = kindleById(id);
              set({ model: picked?.id, finish: picked?.finishes[0], picked: Boolean(picked) });
            }}
            options={[{ id: "", label: t("Recognise it when plugged in") }, ...[...KINDLES].reverse().map((k) => ({ id: k.id, label: `${k.name}, ${k.year}` }))]}
          />
          {model && model.finishes.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-caption text-muted">{t(FINISHES[finish!].label)}</span>
              <ColourPicker
                any={false}
                value={FINISHES[finish!].hex}
                options={model.finishes.map((f) => [FINISHES[f].hex, FINISHES[f].label])}
                onChange={(hex) => set({ finish: model.finishes.find((f) => FINISHES[f].hex === hex) })}
              />
            </div>
          )}
          <div>
            <Button size="sm" icon={PlayCircleIcon} onClick={plugIn}>{t("Play the plug-in animation")}</Button>
          </div>
        </div>
      </div>
      <Group label={t("From your Kindle")}>
        <Row label={t("Highlights and notes")} hint={t("Brings what you marked on a Kindle into the books here, from its My Clippings file.")}>
          <Button size="sm" onClick={() => import("./Clippings").then((m) => m.importClippings())}>{t("Import")}</Button>
        </Row>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Sending by email                                                          */
/* ------------------------------------------------------------------------ */

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-4">
      <span
        className={cx(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-medium tabular-nums transition-colors duration-200",
          done ? "bg-success text-white" : "bg-control text-muted",
        )}
      >
        {done ? <Icon icon={CheckmarkCircle02Icon} size={16} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-2.5 pt-1 text-label font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

function SendingSection() {
  const kindle = useStore((s) => s.settings.kindle);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [server, setServer] = useState(Boolean(kindle.host) && !kindle.from);
  const set = (patch: Partial<typeof kindle>) => setSetting({ kindle: { ...useStore.getState().settings.kindle, ...patch } });
  const ready = Boolean(kindle.to && kindle.from && kindle.host && kindle.hasPassword);
  const toKindle = /@(free\.)?kindle\.com$/i.test(kindle.to);

  const verify = async () => {
    setChecking(true);
    try {
      if (password) {
        await api.setPassword(password);
        set({ hasPassword: true });
        setPassword("");
      }
      await new Promise((r) => setTimeout(r, 350));
      await api.verifyMail();
      toast.success(t("Signed in to your mail. Ready to send"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Title title={t("Sending by email")}>
        {t("Every Kindle has an email address. Shelfed mails books to it from your own account, and Amazon puts them on all your Kindles and Kindle apps.")}
      </Title>
      <div className="mb-6 flex items-center gap-3 rounded-[16px] border border-border bg-well px-4 py-3">
        <span className={cx("size-2 shrink-0 rounded-full", ready ? "bg-success" : "bg-line-strong")} />
        <p className="flex-1 text-label">{ready ? t("Ready to send to {address}", { address: kindle.to }) : t("Not set up yet. Three steps, once.")}</p>
      </div>
      <Group>
        <Step n={1} title={t("Let your address send to your Kindle")} done={ready}>
          <p className="text-caption text-muted">
            {/* Amazon's page keeps its own English name; the sentence around it is translated. */}
            {withLink(
              t("In Amazon’s {link}, under Preferences and Personal Document Settings, add the address you’ll send from to the approved list."),
              <TextLink href="https://www.amazon.com/mycd">Content and Devices</TextLink>,
            )}
          </p>
        </Step>
        <Step n={2} title={t("Your Kindle’s address")} done={toKindle}>
          <Input placeholder="you_abc123@kindle.com" value={kindle.to} onChange={(e) => set({ to: e.target.value.trim() })} />
          <p className="mt-1.5 text-caption text-muted">{t("It’s listed on the same Amazon page.")}</p>
        </Step>
        <Step n={3} title={t("Your mail")} done={Boolean(kindle.from && kindle.hasPassword)}>
          <div className="flex flex-col gap-3">
            <Field label={t("Send from")}>
              <Input
                placeholder="you@gmail.com"
                value={kindle.from}
                onChange={async (e) => {
                  const from = e.target.value.trim();
                  set({ from, user: kindle.user && kindle.user !== kindle.from ? kindle.user : from });
                  const preset = await api.smtpPreset(from);
                  if (preset) set(preset);
                }}
              />
            </Field>
            <Field
              label={
                <span className="flex items-center gap-2">
                  {t("App password")} {kindle.hasPassword && <Badge tone="success">{isMac ? t("Saved in the Keychain") : t("Saved in the system vault")}</Badge>}
                </span>
              }
              hint={t("Gmail, iCloud, Outlook and Yahoo want an app password, made in your account’s security settings.")}
            >
              <Input type="password" placeholder={kindle.hasPassword ? t("Saved") : t("App password")} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {server ? (
              <div className="grid grid-cols-6 gap-3">
                <Field label={t("Mail server")} className="col-span-4">
                  <Input placeholder="smtp.example.com" value={kindle.host} onChange={(e) => set({ host: e.target.value.trim() })} />
                </Field>
                <Field label={t("Port")} className="col-span-2">
                  <Input inputMode="numeric" value={kindle.port} onChange={(e) => set({ port: Number(e.target.value) || 0, secure: Number(e.target.value) === 465 })} />
                </Field>
                <Field label={t("User name")} className="col-span-6">
                  <Input placeholder={kindle.from} value={kindle.user} onChange={(e) => set({ user: e.target.value.trim() })} />
                </Field>
              </div>
            ) : (
              <p className="text-caption text-muted">
                {kindle.host ? t("Sends through {host}.", { host: kindle.host }) : t("The mail server is filled in for common services.")}{" "}
                <button className="font-medium text-foreground underline decoration-underline underline-offset-4" onClick={() => setServer(true)}>
                  {t("Change it")}
                </button>
              </p>
            )}
          </div>
        </Step>
      </Group>
      <Group label={t("Books you send")}>
        <Row label={t("Send as")} hint={t("EPUB looks best on Kindle. Other books are made into EPUB first.")}>
          <Segmented
            label={t("Send as")}
            size="sm"
            value={kindle.format}
            onChange={(format) => set({ format })}
            options={[{ id: "epub", label: "EPUB" }, { id: "pdf", label: "PDF" }, { id: "original", label: t("As is") }]}
          />
        </Row>
      </Group>
      <div className="flex justify-end">
        <Button variant="primary" icon={MailSend01Icon} disabled={checking || !kindle.from || !kindle.host || (!password && !kindle.hasPassword)} onClick={verify}>
          {checking ? t("Checking") : password ? t("Save and check") : t("Check connection")}
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Converting                                                                */
/* ------------------------------------------------------------------------ */

/** Page sizes in millimetres, to draw them to scale. */
const PAPER = { A5: [148, 210], A4: [210, 297], Letter: [216, 279], Kindle: [90, 122] } as const;

function ConvertingSection() {
  const page = useStore((s) => s.settings.pdfPage);
  return (
    <>
      <Title title={t("Converting")}>
        {t(
          "All built in, with nothing to install. Shelfed reads EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, web pages and text, and makes EPUB, AZW3 for Kindle, PDF, Word, FB2, plain text and web pages.",
        )}
      </Title>
      <Group label={t("PDF pages")}>
        <div className="grid grid-cols-4 gap-3 p-4">
          {(Object.keys(PAPER) as Array<keyof typeof PAPER>).map((id) => {
            const [w, h] = PAPER[id];
            return (
              <Choice key={id} on={page === id} label={id} onClick={() => setSetting({ pdfPage: id })}>
                <span className="flex h-[96px] w-full items-end justify-center bg-well pb-3">
                  {/* Each page drawn to scale against the others. */}
                  <span className="block rounded-[2px] bg-card shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--line-strong)]" style={{ width: w * 0.24, height: h * 0.24 }} />
                </span>
              </Choice>
            );
          })}
        </div>
        <div className="px-4 py-3 text-caption text-muted">
          {page === "Kindle"
            ? t("Pages the size of a Paperwhite screen, for reading PDFs on a Kindle.")
            : t("{width} by {height} mm, for printing.", { width: PAPER[page][0], height: PAPER[page][1] })}
        </div>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* About                                                                     */
/* ------------------------------------------------------------------------ */

/** Where finding a new version has got to, and the button for the next step. */
function Updates() {
  const update = useStore((s) => s.update);
  const check = () => api.checkForUpdates();
  const line: Record<UpdateState["state"], ReactNode> = {
    idle: null,
    checking: t("Looking for a new version…"),
    none: t("This is the latest version."),
    downloading: update.state === "downloading" && t("Downloading {version}, {percent}%", { version: update.version, percent: Math.round(update.progress * 100) }),
    ready: update.state === "ready" && t("Shelfed {version} is ready to go in.", { version: update.version }),
    available: update.state === "available" && t("Shelfed {version} is out.", { version: update.version }),
    failed: update.state === "failed" && update.error,
  };
  return (
    <div className="mt-4 flex flex-col items-center gap-2.5">
      {line[update.state] && <p className="text-caption text-muted">{line[update.state]}</p>}
      {update.state === "ready" ? (
        <Button size="sm" variant="primary" onClick={() => api.installUpdate()}>{t("Restart to update")}</Button>
      ) : update.state === "available" ? (
        <Button size="sm" variant="primary" onClick={() => api.installUpdate()}>{t("Download")}</Button>
      ) : (
        <Button size="sm" disabled={update.state === "checking" || update.state === "downloading"} onClick={check}>{t("Check for updates")}</Button>
      )}
    </div>
  );
}

function AboutSection() {
  const version = useStore((s) => s.version);
  const icon = useStore((s) => s.settings.icon ?? "paper");
  const updates = useStore((s) => s.settings.updates !== false);
  const books = useStore((s) => s.books.length);
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      {/* The icon you chose, as it looks in the Dock or on the taskbar. */}
      <span className="relative block size-24 overflow-hidden rounded-[22.5%] shadow-[0_10px_28px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.04)]">
        <img src={iconSrc(icon)} alt="" draggable={false} className={cx("absolute inset-0 size-full", isMac && "scale-[1.243]")} />
      </span>
      <h2 className="mt-5 text-[26px] font-medium tracking-[-0.02em]">Shelfed</h2>
      <p className="mt-1 text-label text-muted">{t("Version {version}", { version })}</p>
      <Updates />
      <p className="serif mt-5 max-w-[30ch] text-[17px] leading-snug">{t("A quiet home for your books.")}</p>
      {books > 0 && <p className="mt-2 text-caption text-muted">{tn(books, "Keeping {n} book for you.", "Keeping {n} books for you.")}</p>}
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button size="sm" icon={Globe02Icon} onClick={() => api.openExternal("https://simonveprek.github.io/shelf")}>{t("Website")}</Button>
        <Button size="sm" icon={GithubIcon} onClick={() => api.openExternal("https://github.com/simonveprek/shelfed")}>{t("Source")}</Button>
        <Button size="sm" icon={LicenseIcon} onClick={() => api.openExternal("https://github.com/simonveprek/shelfed/blob/main/LICENSE")}>{t("Licence")}</Button>
      </div>
      <div className="mt-8 w-full max-w-[460px] text-left">
        <Group>
          <div className="px-4 py-1">
            <SwitchRow
              label={t("Look for updates")}
              hint={t("Checks GitHub now and then for a new version.")}
              checked={updates}
              onChange={(on) => setSetting({ updates: on })}
            />
          </div>
          <Row label={t("Log")} hint={t("What Shelfed noted while running, for a bug report.")}>
            <Button size="sm" onClick={() => api.showLog()}>{t(revealLabel)}</Button>
          </Row>
        </Group>
      </div>
      <p className="mt-6 text-caption text-muted">
        {withLink(t("Made by {name}, built on Fragms Personal."), <TextLink href="https://simonveprek.cz">Šimon Vepřek</TextLink>, "{name}")}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The window                                                                */
/* ------------------------------------------------------------------------ */

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: IconLike; tint: string; render: () => ReactNode }> = [
  { id: "library", label: "Library", icon: Folder01Icon, tint: "#c99a2e", render: () => <LibrarySection /> },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon, tint: "#5b4bd6", render: () => <AppearanceSection /> },
  { id: "reading", label: "Reading", icon: BookOpen01Icon, tint: "#2f8f5b", render: () => <ReadingSection /> },
  { id: "kindle", label: "Kindle", icon: Tablet01Icon, tint: "#2b2b2e", render: () => <KindleSection /> },
  { id: "sending", label: "Sending", icon: MailSend01Icon, tint: "#2b6fff", render: () => <SendingSection /> },
  { id: "converting", label: "Converting", icon: ArrowDataTransferHorizontalIcon, tint: "#a23bff", render: () => <ConvertingSection /> },
  { id: "about", label: "About Shelfed", icon: InformationCircleIcon, tint: "#8c857c", render: () => <AboutSection /> },
];

export function SettingsDialog({ tab }: { tab?: SettingsSection }) {
  const [current, setCurrent] = useState<SettingsSection>(tab ?? "library");
  const close = () => useStore.setState({ dialog: null });
  const section = SECTIONS.find((s) => s.id === current) ?? SECTIONS[0];
  return (
    <Dialog open onClose={close} label={t("Settings")} className="sm:max-w-[880px]">
      <div className="flex h-[min(640px,86vh)]">
        <aside className="flex w-[210px] shrink-0 flex-col border-r border-border bg-well p-3">
          <p className="px-2.5 pt-2 pb-4 text-[15px] font-medium tracking-[-0.01em]">{t("Settings")}</p>
          <nav className="flex flex-col gap-0.5" aria-label={t("Settings")}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setCurrent(s.id)}
                aria-current={s.id === current ? "page" : undefined}
                className={cx(
                  "flex h-10 items-center gap-3 rounded-item px-2.5 text-left text-label transition-colors duration-150",
                  s.id === current ? "bg-card font-medium text-foreground shadow-card" : "text-muted hover:bg-control hover:text-foreground",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)]" style={{ background: s.tint }}>
                  <Icon icon={s.icon} size={14} />
                </span>
                {tc("settings", s.label)}
              </button>
            ))}
          </nav>
        </aside>
        <div className="relative min-w-0 flex-1">
          <IconButton label={t("Close")} icon={Cancel01Icon} className="absolute top-3 right-3 z-10" onClick={close} />
          <div className="scroll h-full px-9 pt-9 pb-10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                {section.render()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
