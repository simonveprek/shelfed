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
import { chooseIcon, iconSrc } from "@/lib/icon";
import { useKindlePort } from "@/lib/kindle";
import { hydrate, setSetting, useStore, type SettingsSection } from "@/lib/store";
import { bytes, plural } from "@/lib/util";
import { FINISHES, KINDLES, kindleById } from "../../../shared/kindles";
import { APP_ICONS } from "../../../shared/icons";
import type { UpdateState } from "../../../shared/types";
import { ColourPicker } from "./Colours";
import { Kindle3D } from "./Kindle3D";
import { Mark } from "./Logo";

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
  const books = useStore((s) => s.books);
  const mood = useStore((s) => s.mood);
  const size = useMemo(() => books.reduce((n, b) => n + b.formats.reduce((m, f) => m + f.size, 0), 0), [books]);
  const authors = useMemo(() => new Set(books.flatMap((b) => b.authors)).size, [books]);
  const parts = path.split(/[\\/]/).filter(Boolean);
  return (
    <>
      <Title title="Library">Your books live in a plain folder, one folder for each author, so they stay yours and readable without Shelf.</Title>
      <Group>
        <div className="flex items-center gap-4 px-4 py-4">
          <Point shape="squircle" mood={mood ?? "idle"} size={44} look="pointer" energy={0.8} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-medium">{parts.at(-1) ?? path}</p>
            <p className="line-clamp-1 text-caption break-all text-muted" title={path}>{path}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => api.revealLibrary()}>{revealLabel.replace(/^Show in /, "Open in ")}</Button>
            <Button
              size="sm"
              onClick={async () => {
                const state = await api.moveLibrary();
                if (state) {
                  hydrate(state);
                  toast.success("Switched to the new library folder");
                }
              }}
            >
              Move…
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {[
            [books.length.toLocaleString(), books.length === 1 ? "book" : "books"],
            [authors.toLocaleString(), authors === 1 ? "author" : "authors"],
            [bytes(size), "on disk"],
          ].map(([value, label]) => (
            <div key={label} className="px-4 py-3.5">
              <p className="text-[20px] leading-tight font-medium tracking-[-0.02em] tabular-nums">{value}</p>
              <p className="text-caption text-muted">{label}</p>
            </div>
          ))}
        </div>
      </Group>
      <Group label="The first time">
        <Row label="The welcome" hint="The short story about reading Shelf opens with.">
          <Button size="sm" onClick={() => useStore.setState({ dialog: null, onboarding: true })}>Show it again</Button>
        </Row>
      </Group>
    </>
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

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const current = (theme as "system" | "light" | "dark") ?? "system";
  const chosen = useStore((s) => s.settings.icon ?? "paper");
  return (
    <>
      <Title title="Appearance">Light, dark, or following your system through the day.</Title>
      <div className="grid grid-cols-3 gap-4">
        {(["system", "light", "dark"] as const).map((id) => (
          <Choice key={id} on={current === id} label={{ system: "Auto", light: "Light", dark: "Dark" }[id]} onClick={() => setTheme(id)}>
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
      <h3 className="mt-9 mb-1 text-label font-medium">App icon</h3>
      <p className="mb-4 text-caption text-muted">
        {isMac ? "Shows in the Dock while Shelf is open." : "Shows on the taskbar while Shelf is open."}
      </p>
      <div className="grid grid-cols-6 gap-4">
        {APP_ICONS.map((icon) => (
          <IconChoice key={icon.id} id={icon.id} label={icon.label} on={chosen === icon.id} />
        ))}
      </div>
      <p className="mt-6 text-caption text-muted">The bookcase has its own look, in its menu: shelves, wood, spines and ribbons.</p>
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
      <Title title="Reading">How books look when you open them. Size, spacing and page colour change from the Aa button while you read.</Title>
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
      <Group label="Type">
        <div className="grid grid-cols-3 gap-3 p-4">
          {(Object.keys(FACES) as Array<keyof typeof FACES>).map((id) => (
            <Choice key={id} on={reader.font === id} label={FACES[id].label} onClick={() => set({ font: id })}>
              <span className="flex h-[72px] w-full flex-col items-center justify-center bg-well">
                <span className="text-[30px] leading-none" style={{ fontFamily: FACES[id].family, fontStyle: id === "publisher" ? "italic" : undefined }}>
                  Aa
                </span>
              </span>
            </Choice>
          ))}
        </div>
        <div className="px-4 py-1">
          <SwitchRow label="Justify text" hint="Even edges on both sides, with hyphens." checked={reader.justify} onChange={(justify) => set({ justify })} />
        </div>
      </Group>
      <Group label="Turning pages">
        <Row label="Page turns" hint={reader.flow === "paginated" ? "One page at a time, like a book." : "One long page, like the web."}>
          <Segmented
            label="Page turns"
            size="sm"
            value={reader.flow}
            onChange={(flow) => set({ flow })}
            options={[{ id: "paginated", label: "Pages" }, { id: "scrolled", label: "Scroll" }]}
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
  const stranger = Boolean(found?.length) && !found?.some((k) => k.model);
  const set = (patch: Partial<typeof kindle>) => setSetting({ kindle: { ...useStore.getState().settings.kindle, ...patch } });
  // Settings steps aside first, so the welcome has the whole window.
  const plugIn = () => {
    useStore.setState({ dialog: null });
    setTimeout(() => useStore.setState({ kindleArrived: Date.now() }), 300);
  };

  return (
    <>
      <Title title="Kindle">Plug your Kindle in and Shelf recognises it. Or pick it here, and choose its colour.</Title>
      <div className="mb-6 flex flex-wrap items-center gap-8 rounded-[18px] border border-border bg-well px-7 py-7">
        <div className="flex w-[190px] shrink-0 justify-center">
          {model ? (
            <Kindle3D model={model} finish={finish} book={reading} height={model.size[1] > 200 ? 220 : 200} />
          ) : (
            <div className="flex h-[200px] w-[140px] items-center justify-center rounded-[16px] border border-dashed border-line-strong p-4 text-center text-caption text-muted">
              Plug it in, or pick it from the list
            </div>
          )}
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-4">
          <div>
            <p className="text-[20px] leading-tight font-medium tracking-[-0.02em]">{model?.name ?? "Not known yet"}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-muted">
              {model && <span>{model.year}, {model.screen}″ {model.colour ? "colour " : ""}screen</span>}
              {plugged && <Badge tone="success">Plugged in</Badge>}
              {stranger && <Badge>A Kindle Shelf doesn't know is plugged in</Badge>}
            </p>
          </div>
          <Select
            label="Model"
            size="sm"
            value={kindle.model ?? ""}
            onChange={(id) => {
              const picked = kindleById(id);
              set({ model: picked?.id, finish: picked?.finishes[0], picked: Boolean(picked) });
            }}
            options={[{ id: "", label: "Recognise it when plugged in" }, ...[...KINDLES].reverse().map((k) => ({ id: k.id, label: `${k.name}, ${k.year}` }))]}
          />
          {model && model.finishes.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-caption text-muted">{FINISHES[finish!].label}</span>
              <ColourPicker
                any={false}
                value={FINISHES[finish!].hex}
                options={model.finishes.map((f) => [FINISHES[f].hex, FINISHES[f].label])}
                onChange={(hex) => set({ finish: model.finishes.find((f) => FINISHES[f].hex === hex) })}
              />
            </div>
          )}
          <div>
            <Button size="sm" icon={PlayCircleIcon} onClick={plugIn}>Play the plug-in animation</Button>
          </div>
        </div>
      </div>
      <Group label="From your Kindle">
        <Row label="Highlights and notes" hint="Brings what you marked on a Kindle into the books here, from its My Clippings file.">
          <Button size="sm" onClick={() => import("./Clippings").then((m) => m.importClippings())}>Import</Button>
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
      toast.success("Signed in to your mail. Ready to send");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Title title="Sending by email">
        Every Kindle has an email address. Shelf mails books to it from your own account, and Amazon puts them on all your Kindles and Kindle apps.
      </Title>
      <div className="mb-6 flex items-center gap-3 rounded-[16px] border border-border bg-well px-4 py-3">
        <span className={cx("size-2 shrink-0 rounded-full", ready ? "bg-success" : "bg-line-strong")} />
        <p className="flex-1 text-label">{ready ? `Ready to send to ${kindle.to}` : "Not set up yet. Three steps, once."}</p>
      </div>
      <Group>
        <Step n={1} title="Let your address send to your Kindle" done={ready}>
          <p className="text-caption text-muted">
            In Amazon’s <TextLink href="https://www.amazon.com/mycd">Content and Devices</TextLink>, under Preferences and Personal Document Settings, add the
            address you’ll send from to the approved list.
          </p>
        </Step>
        <Step n={2} title="Your Kindle’s address" done={toKindle}>
          <Input placeholder="you_abc123@kindle.com" value={kindle.to} onChange={(e) => set({ to: e.target.value.trim() })} />
          <p className="mt-1.5 text-caption text-muted">It’s listed on the same Amazon page.</p>
        </Step>
        <Step n={3} title="Your mail" done={Boolean(kindle.from && kindle.hasPassword)}>
          <div className="flex flex-col gap-3">
            <Field label="Send from">
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
                  App password {kindle.hasPassword && <Badge tone="success">Saved in the {isMac ? "Keychain" : "system vault"}</Badge>}
                </span>
              }
              hint="Gmail, iCloud, Outlook and Yahoo want an app password, made in your account’s security settings."
            >
              <Input type="password" placeholder={kindle.hasPassword ? "Saved" : "App password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {server ? (
              <div className="grid grid-cols-6 gap-3">
                <Field label="Mail server" className="col-span-4">
                  <Input placeholder="smtp.example.com" value={kindle.host} onChange={(e) => set({ host: e.target.value.trim() })} />
                </Field>
                <Field label="Port" className="col-span-2">
                  <Input inputMode="numeric" value={kindle.port} onChange={(e) => set({ port: Number(e.target.value) || 0, secure: Number(e.target.value) === 465 })} />
                </Field>
                <Field label="User name" className="col-span-6">
                  <Input placeholder={kindle.from} value={kindle.user} onChange={(e) => set({ user: e.target.value.trim() })} />
                </Field>
              </div>
            ) : (
              <p className="text-caption text-muted">
                {kindle.host ? `Sends through ${kindle.host}. ` : "The mail server is filled in for common services. "}
                <button className="font-medium text-foreground underline decoration-underline underline-offset-4" onClick={() => setServer(true)}>
                  Change it
                </button>
              </p>
            )}
          </div>
        </Step>
      </Group>
      <Group label="Books you send">
        <Row label="Send as" hint="EPUB looks best on Kindle. Other books are made into EPUB first.">
          <Segmented
            label="Send as"
            size="sm"
            value={kindle.format}
            onChange={(format) => set({ format })}
            options={[{ id: "epub", label: "EPUB" }, { id: "pdf", label: "PDF" }, { id: "original", label: "As is" }]}
          />
        </Row>
      </Group>
      <div className="flex justify-end">
        <Button variant="primary" icon={MailSend01Icon} disabled={checking || !kindle.from || !kindle.host || (!password && !kindle.hasPassword)} onClick={verify}>
          {checking ? "Checking" : password ? "Save and check" : "Check connection"}
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
  const calibre = useStore((s) => s.calibre);
  const page = useStore((s) => s.settings.pdfPage);
  return (
    <>
      <Title title="Converting">
        Built in, with nothing to install: EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, web pages and text become EPUB, PDF, plain text or a web page.
      </Title>
      <Group>
        <Row
          label={<span className="flex items-center gap-2">Calibre {calibre && <Badge tone="success">Found</Badge>}</span>}
          hint={calibre ? <span className="break-all">{calibre}</span> : "Optional. With it, Shelf also makes AZW3, MOBI and Word, and Kindle files for the cable."}
          wrap
        >
          {!calibre && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => api.openExternal("https://calibre-ebook.com/download")}>Get Calibre</Button>
              <Button
                size="sm"
                onClick={async () => {
                  const found = await api.pickCalibre();
                  useStore.setState({ calibre: found });
                  if (!found) toast.error("That is not Calibre's converter");
                }}
              >
                Find it…
              </Button>
            </div>
          )}
        </Row>
      </Group>
      <Group label="PDF pages">
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
          {page === "Kindle" ? "Pages the size of a Paperwhite screen, for reading PDFs on a Kindle." : `${PAPER[page][0]} by ${PAPER[page][1]} mm, for printing.`}
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
    checking: "Looking for a new version…",
    none: "This is the latest version.",
    downloading: update.state === "downloading" && `Downloading ${update.version}, ${Math.round(update.progress * 100)}%`,
    ready: update.state === "ready" && `Shelf ${update.version} is ready to go in.`,
    available: update.state === "available" && `Shelf ${update.version} is out.`,
    failed: update.state === "failed" && update.error,
  };
  return (
    <div className="mt-4 flex flex-col items-center gap-2.5">
      {line[update.state] && <p className="text-caption text-muted">{line[update.state]}</p>}
      {update.state === "ready" ? (
        <Button size="sm" variant="primary" onClick={() => api.installUpdate()}>Restart to update</Button>
      ) : update.state === "available" ? (
        <Button size="sm" variant="primary" onClick={() => api.installUpdate()}>Download</Button>
      ) : (
        <Button size="sm" disabled={update.state === "checking" || update.state === "downloading"} onClick={check}>Check for updates</Button>
      )}
    </div>
  );
}

function AboutSection() {
  const version = useStore((s) => s.version);
  const updates = useStore((s) => s.settings.updates !== false);
  const books = useStore((s) => s.books.length);
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <span className="flex size-20 items-center justify-center rounded-[22px] border border-border bg-[#f7f5f0] shadow-card">
        <Mark size={44} />
      </span>
      <h2 className="mt-5 text-[26px] font-medium tracking-[-0.02em]">Shelf</h2>
      <p className="mt-1 text-label text-muted">Version {version}</p>
      <Updates />
      <p className="serif mt-5 max-w-[30ch] text-[17px] leading-snug">A quiet home for your books.</p>
      {books > 0 && <p className="mt-2 text-caption text-muted">Keeping {plural(books, "book")} for you.</p>}
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button size="sm" icon={Globe02Icon} onClick={() => api.openExternal("https://simonveprek.github.io/shelf")}>Website</Button>
        <Button size="sm" icon={GithubIcon} onClick={() => api.openExternal("https://github.com/simonveprek/shelf")}>Source</Button>
        <Button size="sm" icon={LicenseIcon} onClick={() => api.openExternal("https://github.com/simonveprek/shelf/blob/main/LICENSE")}>Licence</Button>
      </div>
      <div className="mt-8 w-full max-w-[460px] text-left">
        <Group>
          <div className="px-4 py-1">
            <SwitchRow
              label="Look for updates"
              hint="Checks GitHub now and then for a new version."
              checked={updates}
              onChange={(on) => setSetting({ updates: on })}
            />
          </div>
          <Row label="Log" hint="What Shelf noted while running, for a bug report.">
            <Button size="sm" onClick={() => api.showLog()}>{revealLabel}</Button>
          </Row>
        </Group>
      </div>
      <p className="mt-6 text-caption text-muted">
        Made by <TextLink href="https://simonveprek.cz">Šimon Vepřek</TextLink>, built on Fragms Personal.
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
  { id: "about", label: "About Shelf", icon: InformationCircleIcon, tint: "#8c857c", render: () => <AboutSection /> },
];

export function SettingsDialog({ tab }: { tab?: SettingsSection }) {
  const [current, setCurrent] = useState<SettingsSection>(tab ?? "library");
  const close = () => useStore.setState({ dialog: null });
  const section = SECTIONS.find((s) => s.id === current) ?? SECTIONS[0];
  return (
    <Dialog open onClose={close} label="Settings" className="sm:max-w-[880px]">
      <div className="flex h-[min(640px,86vh)]">
        <aside className="flex w-[210px] shrink-0 flex-col border-r border-border bg-well p-3">
          <p className="px-2.5 pt-2 pb-4 text-[15px] font-medium tracking-[-0.01em]">Settings</p>
          <nav className="flex flex-col gap-0.5" aria-label="Settings">
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
                {s.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="relative min-w-0 flex-1">
          <IconButton label="Close" icon={Cancel01Icon} className="absolute top-3 right-3 z-10" onClick={close} />
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
