import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Book02Icon, BookOpen01Icon, Bookshelf01Icon, FileAddIcon, FolderAddIcon, GridViewIcon, Layers01Icon,
  LeftToRightListBulletIcon, Settings01Icon, Tablet01Icon, ThreeDViewIcon, UserIcon, Globe02Icon,
} from "@hugeicons/core-free-icons";
import { Command, EASE, Panel, Progress, type CommandItem } from "@/components/ui";
import { Point } from "@/components/fragms/points";
import { importPaths, openReader, pickAndImport } from "@/lib/actions";
import { mod } from "@/lib/api";
import { newCollection, runCommand } from "@/lib/commands";
import { useStore, type Section } from "@/lib/store";
import { authorsOf } from "@/lib/util";
import { Cover } from "./Cover";
import { language, t } from "../../../shared/i18n";

/* ------------------------------------------------------------------------ */
/* Work in progress, in the corner                                           */
/* ------------------------------------------------------------------------ */

export function Jobs() {
  const jobs = useStore((s) => s.jobs);
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[55] flex w-[300px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {jobs.map((job) => (
          <motion.div
            key={job.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: EASE } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE } }}
            className="pointer-events-auto"
          >
            <Panel className="p-4 shadow-float">
              <Progress
                size="sm"
                value={job.progress === null ? undefined : job.progress * 100}
                indeterminate={job.progress === null}
                label={<span className="line-clamp-1 font-medium">{job.title}</span>}
                showValue={job.progress !== null}
              />
              {job.detail && <p className="mt-2 line-clamp-1 text-caption text-muted">{job.detail}</p>}
            </Panel>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Dropping files on the window                                              */
/* ------------------------------------------------------------------------ */

export function DropZone() {
  const dragging = useStore((s) => s.dragging);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (++depth.current === 1) useStore.setState({ dragging: true });
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) useStore.setState({ dragging: false });
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // A picture dropped on the cover in the details panel is handled there.
      const taken = e.defaultPrevented;
      e.preventDefault();
      depth.current = 0;
      useStore.setState({ dragging: false });
      if (taken) return;
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => window.shelf.pathForFile(f)).filter(Boolean);
      if (paths.length) importPaths(paths);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <AnimatePresence>
      {dragging && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[70] p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
        >
          <div className="flex size-full flex-col items-center justify-center rounded-card border-2 border-dashed border-line-strong bg-background/85 backdrop-blur-md">
            <motion.div initial={{ scale: 0.85, y: 8 }} animate={{ scale: 1, y: 0, transition: { duration: 0.4, ease: [0.34, 1.36, 0.64, 1] } }}>
              <Point shape="squircle" mood="excited" size={72} />
            </motion.div>
            <p className="mt-6 text-heading">{t("Drop to add to your library")}</p>
            <p className="mt-1.5 text-label text-muted">{t("Books, or whole folders of them")}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------------ */
/* Go to anything, Cmd K                                                     */
/* ------------------------------------------------------------------------ */

export function Palette() {
  const open = useStore((s) => s.palette);
  const books = useStore((s) => s.books);
  const reading = useStore((s) => s.reading);
  const speaks = language();

  const items = useMemo<CommandItem[]>(() => {
    const go = (section: Section) => () => useStore.setState({ section, selection: [], query: "" });
    const recent = [...books].sort((a, b) => (b.opened ?? b.added) - (a.opened ?? a.added));
    return [
      ...recent.map((b) => ({
        id: `book-${b.id}`,
        label: b.title,
        group: t("Books"),
        icon: <Cover book={b} className="w-4 rounded-[2px]" />,
        hint: authorsOf(b),
        keywords: [...b.authors, b.series ?? "", ...b.tags],
        onSelect: () => openReader(b.id),
      })),
      { id: "add", label: t("Add books"), group: t("Do"), icon: FileAddIcon, shortcut: `${mod}O`, onSelect: () => pickAndImport(false) },
      { id: "add-folder", label: t("Add a folder of books"), group: t("Do"), icon: FolderAddIcon, onSelect: () => pickAndImport(true) },
      { id: "collection", label: t("New collection"), group: t("Do"), icon: FolderAddIcon, onSelect: () => newCollection(useStore.getState().selection) },
      { id: "kindle", label: t("Set up Send to Kindle"), group: t("Do"), icon: Tablet01Icon, onSelect: () => useStore.setState({ dialog: { kind: "settings", tab: "sending" } }) },
      { id: "classics", label: t("Classics"), group: t("Go to"), icon: Globe02Icon, keywords: ["free books", "public domain", t("free books"), t("public domain"), "Gutenberg", "Standard Ebooks"], onSelect: go({ kind: "discover" }) },
      { id: "clippings", label: t("Import Kindle highlights"), group: t("Do"), icon: Tablet01Icon, onSelect: () => runCommand("clippings") },
      { id: "welcome", label: t("Show the welcome again"), group: t("Do"), icon: Book02Icon, onSelect: () => useStore.setState({ onboarding: true }) },
      { id: "settings", label: t("Settings"), group: t("Do"), icon: Settings01Icon, shortcut: `${mod},`, onSelect: () => useStore.setState({ dialog: { kind: "settings" } }) },
      { id: "all", label: t("All books"), group: t("Go to"), icon: Book02Icon, onSelect: go({ kind: "all" }) },
      { id: "reading", label: t("Reading"), group: t("Go to"), icon: BookOpen01Icon, onSelect: go({ kind: "reading" }) },
      { id: "authors", label: t("Authors"), group: t("Go to"), icon: UserIcon, onSelect: go({ kind: "browse", by: "author" }) },
      { id: "series", label: t("Series"), group: t("Go to"), icon: Layers01Icon, onSelect: go({ kind: "browse", by: "series" }) },
      { id: "grid", label: t("Covers"), group: t("View"), icon: GridViewIcon, shortcut: `${mod}1`, onSelect: () => runCommand("view:grid") },
      { id: "list", label: t("List"), group: t("View"), icon: LeftToRightListBulletIcon, shortcut: `${mod}2`, onSelect: () => runCommand("view:list") },
      { id: "shelves", label: t("Shelves"), group: t("View"), icon: Bookshelf01Icon, shortcut: `${mod}3`, onSelect: () => runCommand("view:shelves") },
      { id: "bookcase", label: t("Bookcase in 3D"), group: t("View"), icon: ThreeDViewIcon, shortcut: `${mod}4`, onSelect: () => runCommand("view:bookcase") },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, speaks]);

  return (
    <Command
      open={open && !reading}
      onOpenChange={(palette) => useStore.setState({ palette: palette && !useStore.getState().reading })}
      items={items}
      placeholder={t("Find a book or do something")}
      empty={t("Nothing matches")}
    />
  );
}
