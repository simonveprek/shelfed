import { useEffect, useMemo, useState } from "react";
import { Mail01Icon, MailSend01Icon, Tablet01Icon, TabletConnectedUsbIcon } from "@hugeicons/core-free-icons";
import type { Book, KindleDevice } from "../../../shared/types";
import { kindleById } from "../../../shared/kindles";
import { Kindle3D } from "./Kindle3D";
import { KINDLE_LIMIT } from "../../../shared/types";
import {
  AlertDialog, Alert, Badge, Button, Dialog, DialogFooter, DialogHeader, Empty, Field, Input, RadioGroup, Segmented, Spinner, Textarea,
} from "@/components/ui";
import { List, Meter, Row } from "@/components/bits";
import { bringCalibreOver, convertMany, emailPlan, removeBooks, sendByCable, sendByEmail, targetsFor, usbPlan } from "@/lib/actions";
import { api } from "@/lib/api";
import { bookById, patchBooks, saveCollections, setSetting, useStore, type CalibreSummary } from "@/lib/store";
import { bytes, plural } from "@/lib/util";
import { Cover } from "./Cover";
import { PHONE_LIKE, tidyKindle, useFinishedOnKindle, useOnKindle } from "@/lib/kindle";
import { t, tn } from "../../../shared/i18n";

const close = () => useStore.setState({ dialog: null });

function useBooks(ids: string[]) {
  const books = useStore((s) => s.books);
  return useMemo(() => ids.map((id) => books.find((b) => b.id === id)).filter(Boolean) as Book[], [books, ids]);
}

const name = (books: Book[]) => (books.length === 1 ? books[0].title : plural(books.length, "book"));

/** A few books in a well, each with what will happen to it. */
function BookRows({ books, side }: { books: Book[]; side: (b: Book) => React.ReactNode }) {
  return (
    <List inset className="max-h-[220px] overflow-y-auto">
      {books.slice(0, 30).map((book) => (
        <Row key={book.id} className="flex-nowrap px-3 py-2">
          <Cover book={book} className="w-6 shrink-0 rounded-[3px]" />
          <span className="min-w-0 flex-1 truncate text-label font-medium">{book.title}</span>
          {side(book)}
        </Row>
      ))}
      {books.length > 30 && <Row className="px-3 py-2 text-label text-muted">{tn(books.length - 30, "and {n} more book", "and {n} more books")}</Row>}
    </List>
  );
}

/* ------------------------------------------------------------------------ */
/* Send to Kindle                                                            */
/* ------------------------------------------------------------------------ */

export function SendDialog({ ids }: { ids: string[] }) {
  const books = useBooks(ids);
  const kindle = useStore((s) => s.settings.kindle);
  const [mode, setMode] = useState<"email" | "cable">("email");
  const [devices, setDevices] = useState<KindleDevice[] | null>(null);
  const [device, setDevice] = useState("");
  const [sending, setSending] = useState(false);
  const ready = Boolean(kindle.to && kindle.from && kindle.host && kindle.hasPassword);
  const model = kindleById(kindle.model);
  const activity = useStore((s) => s.kindleActivity);

  useEffect(() => {
    if (mode !== "cable") return;
    let alive = true;
    const look = async () => {
      const found = await api.devices();
      if (!alive) return;
      setDevices(found);
      setDevice((d) => d || found[0]?.path || "");
    };
    look();
    // Keeps looking, so plugging the Kindle in while this is open just works.
    const timer = setInterval(look, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [mode]);

  const plans = books.map((book) => ({ book, plan: emailPlan(book), size: book.formats.find((f) => f.ext === emailPlan(book).ext)?.size ?? 0 }));
  const largest = Math.max(0, ...plans.map((p) => p.size));
  const tooBig = largest > KINDLE_LIMIT;
  const cablePlans = books.map((b) => usbPlan(b));
  const cable = useStore((s) => s.kindleCable);
  const onKindle = useOnKindle();
  const already = books.filter((b) => onKindle?.has(b.id)).length;

  return (
    <Dialog open onClose={close} label={t("Send to Kindle")} className="sm:max-w-[520px]">
      <DialogHeader title={t("Send to Kindle")} description={name(books)} />
      <div className="flex flex-col gap-4 px-6 pt-5">
        {model && (
          <div className="-mb-1 flex justify-center rounded-[16px] bg-well pt-5 pb-2">
            <Kindle3D model={model} finish={kindle.finish} book={books[0]} height={150} activity={activity?.via === "email" ? activity : null} />
          </div>
        )}
        <Segmented
          label={t("How to send")}
          block
          value={mode}
          onChange={setMode}
          options={[
            { id: "email", label: t("By email"), icon: Mail01Icon },
            { id: "cable", label: t("By cable"), icon: TabletConnectedUsbIcon },
          ]}
        />

        {mode === "email" && !ready && (
          <Empty
            icon={MailSend01Icon}
            title={t("Set up sending once")}
            description={t("Shelfed mails books to your Kindle address from your own mail account. After that every book is one click.")}
            action={<Button variant="primary" onClick={() => useStore.setState({ dialog: { kind: "settings", tab: "sending" } })}>{t("Set up Kindle")}</Button>}
          />
        )}

        {mode === "email" && ready && (
          <>
            <BookRows
              books={books}
              side={(book) => {
                const plan = emailPlan(book);
                return (
                  <>
                    <Badge>{plan.ext.toUpperCase()}</Badge>
                    <span className="w-16 text-right text-caption text-muted tabular-nums">
                      {plan.convert ? t("made first") : bytes(book.formats.find((f) => f.ext === plan.ext)?.size ?? 0)}
                    </span>
                  </>
                );
              }}
            />
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-label">
                <span className="text-muted">{books.length === 1 ? t("Size") : t("Largest file")}</span>
                <span className="tabular-nums">{t("{size} of 50 MB", { size: bytes(largest) })}</span>
              </div>
              <Meter value={largest} max={KINDLE_LIMIT} />
            </div>
            {tooBig && <Alert tone="danger" title={t("Too big for email")}>{t("Amazon takes up to 50 MB. Convert it to EPUB to make it smaller, or send it by cable.")}</Alert>}
            <p className="text-label text-muted">
              {t("To {address}. Amazon syncs it to every Kindle and Kindle app in a few minutes.", { address: kindle.to })}
            </p>
          </>
        )}

        {mode === "cable" &&
          (devices === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : devices.length === 0 && cable === "phone" ? (
            <Empty
              icon={TabletConnectedUsbIcon}
              title={t("This Kindle can't take books by cable")}
              description={t(PHONE_LIKE)}
              action={<Button size="sm" onClick={() => setMode("email")}>{t("Send by email")}</Button>}
            />
          ) : devices.length === 0 ? (
            <Empty icon={TabletConnectedUsbIcon} title={t("Plug in your Kindle")} description={t("Connect it with a USB cable and unlock it. Shelfed finds it on its own.")} />
          ) : (
            <>
              <RadioGroup
                variant="card"
                label="Kindle"
                value={device}
                onChange={setDevice}
                options={devices.map((d) => ({ value: d.path, label: kindleById(d.model)?.name ?? d.name, description: t("{size} free", { size: bytes(d.free) }) }))}
              />
              <p className="text-label text-muted">
                {cablePlans.some((p) => !p)
                  ? t("Shelfed can't read some of these to make Kindle files from them.")
                  : cablePlans.some((p) => p?.convert)
                    ? t("Books without a Kindle file get an AZW3 made first. Eject the Kindle before you unplug it.")
                    : t("Copies the Kindle files straight to the device. Eject it before you unplug it.")}
              </p>
              {already > 0 && (
                <p className="text-label text-muted">
                  {already === books.length
                    ? books.length === 1
                      ? t("It's already on this Kindle. Copying it again replaces it.")
                      : t("These are all already on this Kindle. Copying them again replaces them.")
                    : tn(already, "{n} of these is already on this Kindle, and copying again replaces it.", "{n} of these are already on this Kindle, and copying again replaces them.")}
                </p>
              )}
            </>
          ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>{t("Cancel")}</Button>
        {mode === "email" && ready && (
          <Button
            variant="primary"
            icon={sending ? <Spinner size="sm" /> : MailSend01Icon}
            disabled={sending || tooBig}
            onClick={async () => {
              setSending(true);
              const ok = await sendByEmail(ids);
              setSending(false);
              // Long enough to see the Kindle catch it.
              if (ok) setTimeout(close, model ? 1100 : 0);
            }}
          >
            {sending ? t("Sending") : books.length === 1 ? t("Send") : tn(books.length, "Send {n} book", "Send {n} books")}
          </Button>
        )}
        {mode === "cable" && devices?.length ? (
          <Button
            variant="primary"
            icon={Tablet01Icon}
            disabled={!device}
            onClick={() => {
              sendByCable(ids, device);
              close();
            }}
          >
            {t("Copy to Kindle")}
          </Button>
        ) : null}
      </DialogFooter>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Convert                                                                   */
/* ------------------------------------------------------------------------ */

export function ConvertDialog({ ids }: { ids: string[] }) {
  const books = useBooks(ids);
  const pdfPage = useStore((s) => s.settings.pdfPage);
  const first = books[0];
  const targets = first ? targetsFor(first) : [];
  const [to, setTo] = useState(() => targets.find((x) => x.possible && !first?.formats.some((f) => f.ext === x.ext))?.ext ?? "epub");
  if (!first) return null;
  const target = targets.find((x) => x.ext === to);

  return (
    <Dialog open onClose={close} label={t("Convert")} className="sm:max-w-[560px]">
      <DialogHeader
        title={t("Convert")}
        description={
          books.length === 1
            ? t("{title}. The new file sits beside its {formats}.", { title: first.title, formats: first.formats.map((f) => f.ext.toUpperCase()).join(` ${t("and")} `) })
            : t("{books}. Each new file sits beside the old ones.", { books: plural(books.length, "book") })
        }
      />
      <div className="scroll flex max-h-[56vh] flex-col gap-4 px-6 pt-5">
        <RadioGroup
          variant="card"
          label={t("Make a")}
          value={to}
          onChange={setTo}
          className="sm:grid-cols-2"
          options={targets.map((x) => ({
            value: x.ext,
            label: t(x.label),
            description: t(x.note),
            // A format the books already have stays as it is. Remove it first to remake it.
            disabled: !x.possible || books.every((b) => b.formats.some((f) => f.ext === x.ext)),
            meta: books.every((b) => b.formats.some((f) => f.ext === x.ext)) ? <Badge tone="success">{t("Have it")}</Badge> : undefined,
          }))}
        />
        {to === "pdf" && (
          <Field label={t("Page size")} hint={t("Kindle makes pages the size of a Paperwhite screen.")}>
            <Segmented
              label={t("Page size")}
              block
              value={pdfPage}
              onChange={(pdfPage) => setSetting({ pdfPage })}
              options={[{ id: "A5", label: "A5" }, { id: "A4", label: "A4" }, { id: "Letter", label: "Letter" }, { id: "Kindle", label: "Kindle" }]}
            />
          </Field>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>{t("Cancel")}</Button>
        <Button
          variant="primary"
          disabled={!target?.possible}
          onClick={() => {
            convertMany(ids, to);
            close();
          }}
        >
          {t("Make {format}", { format: target ? t(target.label) : "" })}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Edit details                                                              */
/* ------------------------------------------------------------------------ */

export function EditDialog({ id }: { id: string }) {
  const book = bookById(id);
  const [form, setForm] = useState(() => ({
    title: book?.title ?? "",
    authors: book?.authors.join(", ") ?? "",
    series: book?.series ?? "",
    seriesIndex: book?.seriesIndex ? String(book.seriesIndex) : "",
    publisher: book?.publisher ?? "",
    published: book?.published ?? "",
    language: book?.language ?? "",
    isbn: book?.isbn ?? "",
    tags: book?.tags.join(", ") ?? "",
    description: book?.description ?? "",
  }));
  if (!book) return null;
  const input = (key: keyof typeof form, label: string, extra: Record<string, unknown> = {}) => (
    <Field label={label}>
      <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...extra} />
    </Field>
  );
  const save = () => {
    const split = (s: string) => s.split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
    patchBooks(
      [id],
      () => ({
        title: form.title.trim() || book.title,
        authors: split(form.authors),
        series: form.series.trim() || undefined,
        seriesIndex: form.seriesIndex ? Number(form.seriesIndex) : undefined,
        publisher: form.publisher.trim() || undefined,
        published: form.published.trim() || undefined,
        language: form.language.trim() || undefined,
        isbn: form.isbn.trim() || undefined,
        tags: split(form.tags),
        description: form.description.trim() || undefined,
      }),
      true,
    );
    close();
  };
  return (
    <Dialog open onClose={close} label={t("Edit details")} className="sm:max-w-[600px]">
      <DialogHeader title={t("Edit details")} description={book.title} />
      <form
        className="scroll grid max-h-[60vh] grid-cols-6 gap-x-3 gap-y-4 px-6 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="col-span-6">{input("title", t("Title"), { autoFocus: true })}</div>
        <div className="col-span-6">{input("authors", t("Authors"), { placeholder: t("Separated by commas") })}</div>
        <div className="col-span-4">{input("series", t("Series"))}</div>
        <div className="col-span-2">{input("seriesIndex", t("Number"), { inputMode: "decimal" })}</div>
        <div className="col-span-3">{input("publisher", t("Publisher"))}</div>
        <div className="col-span-3">{input("published", t("Published"))}</div>
        <div className="col-span-2">{input("language", t("Language"))}</div>
        <div className="col-span-4">{input("isbn", "ISBN")}</div>
        <div className="col-span-6">{input("tags", t("Tags"), { placeholder: t("Separated by commas") })}</div>
        <div className="col-span-6">
          <Field label={t("Description")}>
            <Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>{t("Cancel")}</Button>
        <Button variant="primary" onClick={save}>{t("Save")}</Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Naming a collection                                                       */
/* ------------------------------------------------------------------------ */

export function RenameCollection({ id }: { id: string }) {
  const collections = useStore((s) => s.collections);
  const collection = collections.find((c) => c.id === id);
  const [value, setValue] = useState(collection?.name ?? "");
  if (!collection) return null;
  const save = () => {
    if (value.trim()) saveCollections(collections.map((c) => (c.id === id ? { ...c, name: value.trim() } : c)));
    close();
  };
  return (
    <Dialog open onClose={close} label={t("Name the collection")}>
      <DialogHeader title={t("Name the collection")} />
      <form
        className="px-6 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input autoFocus value={value} onFocus={(e) => e.target.select()} onChange={(e) => setValue(e.target.value)} />
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>{t("Cancel")}</Button>
        <Button variant="primary" onClick={save}>{t("Save")}</Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Removing, with an undo after                                              */
/* ------------------------------------------------------------------------ */

export function RemoveConfirm() {
  const ids = useStore((s) => s.confirmRemove);
  const [held, setHeld] = useState<string[]>([]);
  useEffect(() => {
    if (ids) setHeld(ids);
  }, [ids]);
  const first = bookById(held[0] ?? "");
  return (
    <AlertDialog
      open={Boolean(ids)}
      onClose={() => useStore.setState({ confirmRemove: null })}
      tone="danger"
      title={held.length === 1 ? t("Remove {title}?", { title: first?.title ?? t("this book") }) : tn(held.length, "Remove {n} book?", "Remove {n} books?")}
      description={t("Their files go to the system Trash, with their reading progress. You can undo it for a few seconds.")}
      confirmLabel={t("Remove")}
      onConfirm={() => removeBooks(held)}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Taking finished books off the Kindle                                      */
/* ------------------------------------------------------------------------ */

export function TidyConfirm() {
  const open = useStore((s) => s.confirmTidy);
  const finished = useFinishedOnKindle();
  const count = finished?.books.length ?? 0;
  return (
    <AlertDialog
      open={open && count > 0}
      onClose={() => useStore.setState({ confirmTidy: false })}
      tone="danger"
      title={tn(count, "Take {n} finished book off your Kindle?", "Take {n} finished books off your Kindle?")}
      description={t("That frees {size} on it. A Kindle has no Trash, so they go from it for good, with their notes there, but they stay in your library and can go back on any time.", { size: bytes(finished?.bytes ?? 0) })}
      confirmLabel={t("Take them off")}
      onConfirm={() => tidyKindle()}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Coming from Calibre                                                       */
/* ------------------------------------------------------------------------ */

/** The last two folders of a path, enough to know it by: Documents/Calibre Library. */
const lastFolders = (path: string) => path.split(/[\\/]/).filter(Boolean).slice(-2).join(path.includes("\\") ? "\\" : "/");

export function CalibreDialog({ path, books, working, done }: { path: string; books: number; working?: boolean; done?: CalibreSummary }) {
  if (done) return <CalibreDone summary={done} />;
  return (
    <Dialog open onClose={close} label={t("Coming from Calibre")}>
      <DialogHeader title={t("Coming from Calibre?")} />
      <div className="flex flex-col gap-5 px-6 pt-5">
        <div className="flex items-center gap-4 rounded-[16px] border border-border bg-well px-4 py-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-control">
            {working ? <Spinner /> : <span className="text-[17px] font-medium tabular-nums">{books > 999 ? t("1k+") : books}</span>}
          </span>
          <div className="min-w-0">
            <p className="truncate text-label font-medium">{working ? tn(books, "Bringing {n} book over", "Bringing {n} books over") : t("Your Calibre library, {books}", { books: plural(books, "book") })}</p>
            <p className="truncate text-caption text-muted" title={path}>
              {working ? t("A big library takes a minute or two. Shelfed stays usable meanwhile.") : t("In {folder}", { folder: lastFolders(path) })}
            </p>
          </div>
        </div>
        {!working && (
          <ul className="flex flex-col gap-2 text-label text-muted">
            <li>{t("Each book comes in once, with all its formats and its cover.")}</li>
            <li>{t("The titles, authors, series, tags and ratings you set in Calibre come along.")}</li>
            <li>{t("Calibre's own library is only read, never changed.")}</li>
          </ul>
        )}
      </div>
      <DialogFooter>
        {working ? (
          <Button variant="ghost" onClick={close}>{t("Keep it going in the background")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>{t("Not now")}</Button>
            <Button variant="primary" onClick={() => bringCalibreOver(path, books)}>{t("Bring them over")}</Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}

function CalibreDone({ summary }: { summary: CalibreSummary }) {
  const figures: Array<[number, string, string]> = [
    [summary.added, "book", "books"],
    [summary.series, "series", "series"],
    [summary.authors, "author", "authors"],
    [summary.joined, "copy joined", "copies joined"],
  ];
  return (
    <Dialog open onClose={close} label={t("Your Calibre library is here")}>
      <DialogHeader title={t("Your Calibre library is here")} />
      <div className="px-6 pt-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-border bg-border">
          {figures.map(([value, one, many]) => (
            <div key={many} className="bg-card px-4 py-3.5">
              <p className="text-[22px] leading-tight font-medium tracking-[-0.02em] tabular-nums">{value.toLocaleString()}</p>
              <p className="text-caption text-muted">{tn(value, one, many)}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-caption text-muted">
          {summary.skipped ? `${tn(summary.skipped, "{n} book was here already.", "{n} books were here already.")} ` : ""}
          {t("Your books now live in your Shelfed library as plain files. Calibre and its library are just as they were.")}
        </p>
      </div>
      <DialogFooter>
        <Button variant="primary" onClick={close}>{t("Done")}</Button>
      </DialogFooter>
    </Dialog>
  );
}

