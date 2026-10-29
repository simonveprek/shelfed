import { useMemo, useState } from "react";
import { Tablet01Icon } from "@hugeicons/core-free-icons";
import { Badge, Button, Checkbox, Dialog, DialogFooter, DialogHeader, Empty, toast } from "@/components/ui";
import { List, Row } from "@/components/bits";
import { api } from "@/lib/api";
import { groupClippings, parseClippings, toAnnotations } from "@/lib/clippings";
import { flashMood, patchBooks, useStore } from "@/lib/store";
import { plural } from "@/lib/util";
import { Cover } from "./Cover";
import { t, tn } from "../../../shared/i18n";

const close = () => useStore.setState({ dialog: null });

/** Looks for a plugged in Kindle, or asks for the file, then opens the import. */
export async function importClippings() {
  try {
    const found = await api.clippings();
    if (found.length) {
      useStore.setState({ dialog: { kind: "clippings", text: found.map((f) => f.text).join("\n==========\n"), from: found[0].device } });
      return;
    }
    toast(t("No Kindle plugged in"), {
      description: t("Plug it in with a cable, or choose My Clippings.txt from its documents folder."),
      duration: 8000,
      action: {
        label: t("Choose file"),
        onClick: async () => {
          const text = await api.pickClippings();
          if (text) useStore.setState({ dialog: { kind: "clippings", text, from: "My Clippings.txt" } });
        },
      },
    });
  } catch (error) {
    toast.error((error as Error).message);
  }
}

export function ClippingsDialog({ text, from }: { text: string; from: string }) {
  const books = useStore((s) => s.books);
  const groups = useMemo(() => groupClippings(parseClippings(text), books), [text, books]);
  const matched = useMemo(() => groups.filter((g) => g.book), [groups]);
  const fresh = useMemo(() => new Map(matched.map((g) => [g, toAnnotations(g, g.book!.annotations)])), [matched]);
  const [chosen, setChosen] = useState(() => new Set(matched.filter((g) => (fresh.get(g)?.length ?? 0) > 0).map((g) => g.book!.id)));
  const total = matched.reduce((n, g) => n + (chosen.has(g.book!.id) ? (fresh.get(g)?.length ?? 0) : 0), 0);

  const run = async () => {
    for (const g of matched) {
      const add = fresh.get(g) ?? [];
      if (!chosen.has(g.book!.id) || !add.length) continue;
      await patchBooks([g.book!.id], (b) => ({ annotations: [...(b.annotations ?? []), ...add] }));
    }
    close();
    flashMood("love", 2000);
    toast.success(tn(total, "Brought over {n} highlight", "Brought over {n} highlights"), { description: t("Find them in each book's details and in the reader's notes.") });
  };

  return (
    <Dialog open onClose={close} label={t("Kindle highlights")} className="sm:max-w-[600px]">
      <DialogHeader
        title={t("Kindle highlights")}
        description={
          groups.length
            ? t("From {from}. {books}, {matches} in your library.", { from, books: plural(groups.length, "book"), matches: plural(matched.length, "match", "matches") })
            : t("Nothing to bring over from {from}.", { from })
        }
      />
      <div className="scroll flex max-h-[56vh] flex-col gap-4 px-6 pt-5">
        {!groups.length && <Empty icon={Tablet01Icon} title={t("No highlights found")} description={t("Highlight something on your Kindle, then try again.")} />}
        {matched.length > 0 && (
          <List inset>
            {matched.map((g) => {
              const count = fresh.get(g)?.length ?? 0;
              return (
                <Row key={g.book!.id} className="flex-nowrap gap-3 px-3 py-2.5">
                  <Checkbox
                    aria-label={t("Bring over highlights from {title}", { title: g.book!.title })}
                    checked={chosen.has(g.book!.id) && count > 0}
                    disabled={!count}
                    onChange={(on) =>
                      setChosen((s) => {
                        const next = new Set(s);
                        if (on) next.add(g.book!.id);
                        else next.delete(g.book!.id);
                        return next;
                      })
                    }
                  />
                  <Cover book={g.book!} className="w-7 shrink-0 rounded-[3px]" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-label font-medium">{g.book!.title}</span>
                    <span className="line-clamp-1 text-caption text-muted">{t("On the Kindle as {title}", { title: g.title })}</span>
                  </span>
                  <Badge tone={count ? "strong" : "neutral"}>{count ? tn(count, "{n} new", "{n} new") : t("Already here")}</Badge>
                </Row>
              );
            })}
          </List>
        )}
        {groups.length > matched.length && (
          <div>
            <p className="mb-2 px-1 text-caption font-medium text-muted">{t("Not in your library")}</p>
            <List inset>
              {groups
                .filter((g) => !g.book)
                .slice(0, 40)
                .map((g) => (
                  <Row key={g.title + g.author} className="flex-nowrap px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-label">{g.title}</span>
                      {g.author && <span className="line-clamp-1 text-caption text-muted">{g.author}</span>}
                    </span>
                    <span className="text-caption text-muted tabular-nums">{plural(g.clippings.length, "clipping")}</span>
                  </Row>
                ))}
            </List>
            <p className="mt-2 px-1 text-caption text-muted">{t("Add these books to Shelfed and import again to keep their highlights too.")}</p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>{t("Cancel")}</Button>
        <Button variant="primary" disabled={!total} onClick={run}>
          {total ? tn(total, "Bring over {n} highlight", "Bring over {n} highlights") : t("Nothing new")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
