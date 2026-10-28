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
import { convertMany, emailPlan, removeBooks, sendByCable, sendByEmail, targetsFor, usbPlan } from "@/lib/actions";
import { api } from "@/lib/api";
import { bookById, patchBooks, saveCollections, setSetting, useStore } from "@/lib/store";
import { bytes, plural } from "@/lib/util";
import { Cover } from "./Cover";

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
      {books.length > 30 && <Row className="px-3 py-2 text-label text-muted">and {plural(books.length - 30, "more book")}</Row>}
    </List>
  );
}

/* ------------------------------------------------------------------------ */
/* Send to Kindle                                                            */
/* ------------------------------------------------------------------------ */

export function SendDialog({ ids }: { ids: string[] }) {
  const books = useBooks(ids);
  const kindle = useStore((s) => s.settings.kindle);
  const calibre = useStore((s) => s.calibre);
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
  const cablePlans = books.map((b) => usbPlan(b, calibre));

  return (
    <Dialog open onClose={close} label="Send to Kindle" className="sm:max-w-[520px]">
      <DialogHeader title="Send to Kindle" description={name(books)} />
      <div className="flex flex-col gap-4 px-6 pt-5">
        {model && (
          <div className="-mb-1 flex justify-center rounded-[16px] bg-well pt-5 pb-2">
            <Kindle3D model={model} finish={kindle.finish} book={books[0]} height={150} activity={activity?.via === "email" ? activity : null} />
          </div>
        )}
        <Segmented
          label="How to send"
          block
          value={mode}
          onChange={setMode}
          options={[
            { id: "email", label: "By email", icon: Mail01Icon },
            { id: "cable", label: "By cable", icon: TabletConnectedUsbIcon },
          ]}
        />

        {mode === "email" && !ready && (
          <Empty
            icon={MailSend01Icon}
            title="Set up sending once"
            description="Shelf mails books to your Kindle address from your own mail account. After that every book is one click."
            action={<Button variant="primary" onClick={() => useStore.setState({ dialog: { kind: "settings", tab: "kindle" } })}>Set up Kindle</Button>}
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
                      {plan.convert ? "made first" : bytes(book.formats.find((f) => f.ext === plan.ext)?.size ?? 0)}
                    </span>
                  </>
                );
              }}
            />
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-label">
                <span className="text-muted">{books.length === 1 ? "Size" : "Largest file"}</span>
                <span className="tabular-nums">{bytes(largest)} of 50 MB</span>
              </div>
              <Meter value={largest} max={KINDLE_LIMIT} />
            </div>
            {tooBig && <Alert tone="danger" title="Too big for email">Amazon takes up to 50 MB. Convert it to EPUB to make it smaller, or send it by cable.</Alert>}
            <p className="text-label text-muted">
              To {kindle.to}. Amazon syncs it to every Kindle and Kindle app in a few minutes.
            </p>
          </>
        )}

        {mode === "cable" &&
          (devices === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : devices.length === 0 ? (
            <Empty icon={TabletConnectedUsbIcon} title="Plug in your Kindle" description="Connect it with a USB cable and unlock it. Shelf finds it on its own." />
          ) : (
            <>
              <RadioGroup
                variant="card"
                label="Kindle"
                value={device}
                onChange={setDevice}
                options={devices.map((d) => ({ value: d.path, label: kindleById(d.model)?.name ?? d.name, description: `${bytes(d.free)} free` }))}
              />
              <p className="text-label text-muted">
                {cablePlans.some((p) => !p)
                  ? "Some of these need Calibre to become AZW3 first. Install Calibre and Shelf uses it on its own."
                  : cablePlans.some((p) => p?.convert)
                    ? "Books without a Kindle format are made into AZW3 with Calibre first."
                    : "Copies the Kindle files straight to the device. Eject it before you unplug it."}
              </p>
            </>
          ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>Cancel</Button>
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
            {sending ? "Sending" : books.length === 1 ? "Send" : `Send ${books.length} books`}
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
            Copy to Kindle
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
  const calibre = useStore((s) => s.calibre);
  const pdfPage = useStore((s) => s.settings.pdfPage);
  const first = books[0];
  const targets = first ? targetsFor(first, calibre) : [];
  const [to, setTo] = useState(() => targets.find((t) => t.via && !first?.formats.some((f) => f.ext === t.ext))?.ext ?? "epub");
  if (!first) return null;
  const target = targets.find((t) => t.ext === to);

  return (
    <Dialog open onClose={close} label="Convert" className="sm:max-w-[560px]">
      <DialogHeader
        title="Convert"
        description={books.length === 1 ? `${first.title}. The new file sits beside its ${first.formats.map((f) => f.ext.toUpperCase()).join(" and ")}.` : `${plural(books.length, "book")}. Each new file sits beside the old ones.`}
      />
      <div className="scroll flex max-h-[56vh] flex-col gap-4 px-6 pt-5">
        <RadioGroup
          variant="card"
          label="Make a"
          value={to}
          onChange={setTo}
          className="sm:grid-cols-2"
          options={targets.map((t) => ({
            value: t.ext,
            label: t.label,
            description: t.note,
            // A format the books already have stays as it is. Remove it first to remake it.
            disabled: !t.via || books.every((b) => b.formats.some((f) => f.ext === t.ext)),
            meta: books.every((b) => b.formats.some((f) => f.ext === t.ext)) ? <Badge tone="success">Have it</Badge> : t.via === "calibre" ? <Badge>Calibre</Badge> : !t.via ? <Badge>Needs Calibre</Badge> : undefined,
          }))}
        />
        {to === "pdf" && (
          <Field label="Page size" hint="Kindle makes pages the size of a Paperwhite screen.">
            <Segmented
              label="Page size"
              block
              value={pdfPage}
              onChange={(pdfPage) => setSetting({ pdfPage })}
              options={[{ id: "A5", label: "A5" }, { id: "A4", label: "A4" }, { id: "Letter", label: "Letter" }, { id: "Kindle", label: "Kindle" }]}
            />
          </Field>
        )}
        {!calibre && (
          <Alert title="More formats with Calibre">
            EPUB, PDF, text and web pages are built in. For AZW3, MOBI and Word, install the free Calibre and Shelf uses it on its own.
          </Alert>
        )}
      </div>
      <DialogFooter>
        {!calibre && <Button variant="ghost" className="sm:mr-auto" onClick={() => api.openExternal("https://calibre-ebook.com/download")} arrow>Get Calibre</Button>}
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!target?.via}
          onClick={() => {
            convertMany(ids, to);
            close();
          }}
        >
          Make {target?.label}
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
    <Dialog open onClose={close} label="Edit details" className="sm:max-w-[600px]">
      <DialogHeader title="Edit details" description={book.title} />
      <form
        className="scroll grid max-h-[60vh] grid-cols-6 gap-x-3 gap-y-4 px-6 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="col-span-6">{input("title", "Title", { autoFocus: true })}</div>
        <div className="col-span-6">{input("authors", "Authors", { placeholder: "Separated by commas" })}</div>
        <div className="col-span-4">{input("series", "Series")}</div>
        <div className="col-span-2">{input("seriesIndex", "Number", { inputMode: "decimal" })}</div>
        <div className="col-span-3">{input("publisher", "Publisher")}</div>
        <div className="col-span-3">{input("published", "Published")}</div>
        <div className="col-span-2">{input("language", "Language")}</div>
        <div className="col-span-4">{input("isbn", "ISBN")}</div>
        <div className="col-span-6">{input("tags", "Tags", { placeholder: "Separated by commas" })}</div>
        <div className="col-span-6">
          <Field label="Description">
            <Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save</Button>
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
    <Dialog open onClose={close} label="Name the collection">
      <DialogHeader title="Name the collection" />
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
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save</Button>
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
      title={held.length === 1 ? `Remove ${first?.title ?? "this book"}?` : `Remove ${held.length} books?`}
      description="Their files go to the system Trash, with their reading progress. You can undo it for a few seconds."
      confirmLabel="Remove"
      onConfirm={() => removeBooks(held)}
    />
  );
}
