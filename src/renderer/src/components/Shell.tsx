import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Add01Icon, Book02Icon, BookOpen01Icon, Bookmark01Icon, CheckmarkCircle02Icon, Delete02Icon, FavouriteIcon,
  File01Icon, FileAddIcon, Folder01Icon, FolderAddIcon, FilterHorizontalIcon, GridViewIcon, Layers01Icon,
  LeftToRightListBulletIcon, Bookshelf01Icon, PencilEdit02Icon, Settings01Icon, SidebarRightIcon, SparklesIcon,
  Tag01Icon, ThreeDViewIcon, UserIcon, ArrowLeft01Icon, Globe02Icon,
} from "@hugeicons/core-free-icons";
import type { SortKey } from "../../../shared/types";
import {
  Badge, ContextMenu, cx, EASE, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, Popover, SearchField, Segmented,
  Select, Sidebar, SidebarGroup, SidebarItem, Slider, SwitchRow, ThemeToggle,
} from "@/components/ui";
import { addToCollection, deleteCollection, pickAndImport } from "@/lib/actions";
import { isMac, isWin, mod, shift } from "@/lib/api";
import { newCollection } from "@/lib/commands";
import { BOOK_MIME } from "@/lib/select";
import { patchBooks, setSetting, useStore, type Browse, type Section } from "@/lib/store";
import { sectionTitle, useVisibleBooks } from "@/lib/view";
import { Logo } from "./Logo";
import { MATERIALS } from "./Bookcase";
import { ColourPicker, RIBBONS } from "./Colours";

const same = (a: Section, b: Section) => JSON.stringify(a) === JSON.stringify(b);

/** Lets books be dropped on a sidebar place. */
function DropTarget({ onDrop, children }: { onDrop?: (ids: string[]) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  if (!onDrop) return <>{children}</>;
  return (
    <div
      className={cx("rounded-item transition-shadow duration-150", over && "shadow-[inset_0_0_0_2px_var(--accent)]")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(BOOK_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const ids = e.dataTransfer.getData(BOOK_MIME);
        if (ids) onDrop(JSON.parse(ids));
      }}
    >
      {children}
    </div>
  );
}

const PLACES: Array<{ kind: "all" | "reading" | "unread" | "finished" | "favorites" | "recent"; label: string; icon: typeof Book02Icon }> = [
  { kind: "all", label: "All books", icon: Book02Icon },
  { kind: "reading", label: "Reading", icon: BookOpen01Icon },
  { kind: "unread", label: "Want to read", icon: Bookmark01Icon },
  { kind: "finished", label: "Finished", icon: CheckmarkCircle02Icon },
  { kind: "favorites", label: "Favorites", icon: FavouriteIcon },
  { kind: "recent", label: "Recently added", icon: SparklesIcon },
];

const BROWSE: Array<{ by: Browse; label: string; icon: typeof Book02Icon }> = [
  { by: "author", label: "Authors", icon: UserIcon },
  { by: "series", label: "Series", icon: Layers01Icon },
  { by: "tag", label: "Tags", icon: Tag01Icon },
  { by: "format", label: "Formats", icon: File01Icon },
];

export function AppSidebar() {
  const section = useStore((s) => s.section);
  const collections = useStore((s) => s.collections);
  const open = useStore((s) => s.settings.sidebar);
  const go = (next: Section) => useStore.setState({ section: next, selection: [] });

  return (
    <Sidebar
      collapsed={!open}
      onCollapsedChange={(collapsed) => setSetting({ sidebar: !collapsed })}
      className="h-full border-r border-border"
      header={
        <div>
          {/* Room for the window buttons, and a place to drag the window by. */}
          <div className={cx("drag -mx-3 -mt-4", isMac ? "h-11" : "h-4")} />
          <div className="flex h-8 items-center px-2">
            <Logo collapsed={!open} />
          </div>
        </div>
      }
    >
      <SidebarGroup>
        {PLACES.map((place) => (
          <DropTarget key={place.kind} onDrop={place.kind === "favorites" ? (ids) => patchBooks(ids, () => ({ favorite: true })) : undefined}>
            <SidebarItem icon={place.icon} active={same(section, { kind: place.kind })} onClick={() => go({ kind: place.kind })}>
              {place.label}
            </SidebarItem>
          </DropTarget>
        ))}
      </SidebarGroup>

      <SidebarGroup label="Discover">
        <SidebarItem icon={Globe02Icon} active={section.kind === "discover"} onClick={() => go({ kind: "discover" })}>
          Classics
        </SidebarItem>
      </SidebarGroup>

      <SidebarGroup label="Collections">
        {collections.map((c) => (
          <ContextMenu
            key={c.id}
            label={c.name}
            width={200}
            menu={
              <>
                <MenuItem icon={PencilEdit02Icon} onSelect={() => useStore.setState({ dialog: { kind: "rename-collection", id: c.id } })}>
                  Rename
                </MenuItem>
                <MenuItem icon={Delete02Icon} danger onSelect={() => deleteCollection(c.id)}>
                  Delete collection
                </MenuItem>
              </>
            }
          >
            <DropTarget onDrop={(ids) => addToCollection(ids, c.id)}>
              <SidebarItem icon={Folder01Icon} active={same(section, { kind: "collection", id: c.id })} onClick={() => go({ kind: "collection", id: c.id })}>
                {c.name}
              </SidebarItem>
            </DropTarget>
          </ContextMenu>
        ))}
        <SidebarItem icon={FolderAddIcon} onClick={() => newCollection(useStore.getState().selection)}>
          New collection
        </SidebarItem>
      </SidebarGroup>

      <SidebarGroup label="Browse">
        {BROWSE.map((item) => (
          <SidebarItem
            key={item.by}
            icon={item.icon}
            active={(section.kind === "browse" || section.kind === "group") && section.by === item.by}
            onClick={() => go({ kind: "browse", by: item.by })}
          >
            {item.label}
          </SidebarItem>
        ))}
      </SidebarGroup>
    </Sidebar>
  );
}

const SORTS: Array<{ id: SortKey; label: string; dir: "asc" | "desc" }> = [
  { id: "added", label: "Date added", dir: "desc" },
  { id: "opened", label: "Last opened", dir: "desc" },
  { id: "title", label: "Title", dir: "asc" },
  { id: "author", label: "Author", dir: "asc" },
  { id: "series", label: "Series", dir: "asc" },
  { id: "rating", label: "Rating", dir: "desc" },
  { id: "progress", label: "Progress", dir: "desc" },
  { id: "size", label: "File size", dir: "desc" },
];

function Search() {
  const query = useStore((s) => s.query);
  useEffect(() => {
    // Typing anywhere in the library starts a search.
    const key = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.reading || s.dialog || s.palette || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.length === 1 && /\S/.test(e.key)) document.getElementById("search")?.focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <SearchField
      id="search"
      value={query}
      spellCheck={false}
      placeholder="Search your books"
      shortcut={`${mod}F`}
      onChange={(e) => useStore.setState({ query: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          useStore.setState({ query: "" });
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Enter" || e.key === "ArrowDown") (e.target as HTMLInputElement).blur();
      }}
      className="w-[clamp(170px,24vw,280px)]"
    />
  );
}

/** A titled group in the display menu. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-caption font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

const Rule = () => <div className="h-px shrink-0 bg-border" />;

/** How the 3D bookcase sorts its shelves and what it is made of. */
function BookcaseOptions() {
  const prefs = useStore((s) => s.settings.bookcase);
  const set = (patch: Partial<typeof prefs>) => setSetting({ bookcase: { ...useStore.getState().settings.bookcase, ...patch } });
  return (
    <>
      <Section title="Shelves">
        <Select
          label="Shelves"
          size="sm"
          value={prefs.group}
          onChange={(group) => set({ group })}
          options={[
            { id: "none", label: "All books together" },
            { id: "author", label: "A shelf for each author" },
            { id: "series", label: "A shelf for each series" },
            { id: "collection", label: "A shelf for each collection" },
            { id: "status", label: "By reading status" },
            { id: "format", label: "By file type" },
          ]}
        />
      </Section>
      <Rule />
      <Section title="The case">
        <div className="grid grid-cols-4 gap-2.5">
          {(Object.keys(MATERIALS) as Array<keyof typeof MATERIALS>).map((key) => {
            const on = prefs.material === key;
            return (
              <button
                key={key}
                aria-pressed={on}
                onClick={() => set({ material: key })}
                className="group flex flex-col items-center gap-2 rounded-[12px] outline-none"
              >
                <span
                  className={cx(
                    "h-12 w-full rounded-[11px] transition-shadow duration-150",
                    on
                      ? "shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)]"
                      : "shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover:shadow-[inset_0_0_0_1px_var(--line-strong),0_0_0_3px_var(--control)] group-focus-visible:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--line-strong)]",
                  )}
                  style={{ background: `linear-gradient(180deg, transparent 62%, rgb(0 0 0 / 0.08) 62%), ${MATERIALS[key].front}` }}
                />
                <span className={cx("text-caption transition-colors duration-150", on ? "text-foreground" : "text-muted group-hover:text-foreground")}>
                  {MATERIALS[key].label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Spines">
        <Segmented
          label="Spines"
          size="sm"
          block
          value={prefs.spines}
          onChange={(spines) => set({ spines })}
          options={[
            { id: "cover", label: "Cover colour" },
            { id: "cloth", label: "Cloth" },
            { id: "ink", label: "Ink" },
          ]}
        />
      </Section>
      <Rule />
      <Section title="On the shelves">
        <div className="flex flex-col gap-4">
          <SwitchRow label="Fill the window" hint="A small library grows to fit." checked={prefs.fit} onChange={(fit) => set({ fit })} />
          <SwitchRow label="Authors on spines" checked={prefs.authors} onChange={(authors) => set({ authors })} />
          <SwitchRow label="Reading ribbons" hint="Rise out of books you're partway through." checked={prefs.ribbons} onChange={(ribbons) => set({ ribbons })} />
          {prefs.ribbons && (
            <div className="-mt-1 flex flex-col gap-2">
              <span className="text-caption text-muted">Ribbon colour, unless a book has its own</span>
              <ColourPicker value={prefs.ribbon} options={RIBBONS} onChange={(ribbon) => set({ ribbon: ribbon ?? "accent" })} />
            </div>
          )}
          <SwitchRow label="Lean toward the pointer" checked={prefs.lean} onChange={(lean) => set({ lean })} />
        </div>
      </Section>
      <Rule />
    </>
  );
}

export function Header() {
  const section = useStore((s) => s.section);
  const collections = useStore((s) => s.collections);
  const settings = useStore((s) => s.settings);
  const total = useStore((s) => s.books.length);
  const visible = useVisibleBooks();
  const own = section.kind === "discover";
  const browsing = section.kind === "browse" || own;

  return (
    <header className={cx("drag flex h-16 shrink-0 items-center gap-2 border-b border-border pl-6", isWin ? "pr-[150px]" : "pr-4")}>
      {section.kind === "group" && (
        <IconButton label="Back" icon={ArrowLeft01Icon} className="-ml-2" onClick={() => useStore.setState({ section: { kind: "browse", by: section.by } })} />
      )}
      <motion.h1
        key={sectionTitle(section, collections)}
        className="truncate text-[15px] font-medium tracking-[-0.01em]"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        {sectionTitle(section, collections)}
      </motion.h1>
      {total > 0 && !browsing && <Badge>{visible.length.toLocaleString()}</Badge>}
      <div className="min-w-4 flex-1" />

      {total > 0 && !own && (
        <>
          <Search />
          {!browsing && (
            <>
              <Segmented
                label="View"
                size="sm"
                value={settings.view}
                onChange={(view) => setSetting({ view })}
                options={[
                  { id: "grid", label: <span className="sr-only">Covers</span>, icon: GridViewIcon },
                  { id: "list", label: <span className="sr-only">List</span>, icon: LeftToRightListBulletIcon },
                  { id: "shelves", label: <span className="sr-only">Shelves</span>, icon: Bookshelf01Icon },
                  { id: "bookcase", label: <span className="sr-only">Bookcase in 3D</span>, icon: ThreeDViewIcon },
                ]}
              />
              <Popover
                label="Display"
                align="end"
                width={settings.view === "bookcase" ? 360 : 280}
                trigger={({ props, open }) => <IconButton {...props} label={settings.view === "bookcase" ? "Bookcase" : "Sort and size"} icon={FilterHorizontalIcon} active={open} />}
              >
                <div className="scroll -m-2 flex max-h-[min(720px,calc(100vh-120px))] flex-col gap-5 p-3">
                  {settings.view === "bookcase" && <BookcaseOptions />}
                  <Section title="Order">
                    <Select
                      label="Sort by"
                      size="sm"
                      value={settings.sort}
                      onChange={(sort) => setSetting({ sort, sortDir: SORTS.find((s) => s.id === sort)!.dir })}
                      options={SORTS.map(({ id, label }) => ({ id, label }))}
                    />
                    <Segmented
                      label="Order"
                      size="sm"
                      block
                      value={settings.sortDir}
                      onChange={(sortDir) => setSetting({ sortDir })}
                      options={[
                        { id: "asc", label: "Ascending" },
                        { id: "desc", label: "Descending" },
                      ]}
                    />
                  </Section>
                  {(settings.view === "grid" || settings.view === "bookcase") && (
                    <Slider
                      label={settings.view === "bookcase" ? (settings.bookcase.fit ? "Smallest book size" : "Book size") : "Cover size"}
                      dense
                      value={settings.gridSize}
                      min={100}
                      max={260}
                      step={4}
                      digits={0}
                      suffix=" px"
                      onChange={(gridSize) => setSetting({ gridSize })}
                    />
                  )}
                </div>
              </Popover>
            </>
          )}
        </>
      )}
      <Menu
        label="Add books"
        align="end"
        width={220}
        trigger={({ props, open }) => <IconButton {...props} label="Add books" icon={Add01Icon} active={open} />}
      >
        <MenuLabel>Add to your library</MenuLabel>
        <MenuItem icon={FileAddIcon} shortcut={`${mod}O`} onSelect={() => pickAndImport(false)}>Books</MenuItem>
        <MenuItem icon={FolderAddIcon} shortcut={`${mod}${shift}O`} onSelect={() => pickAndImport(true)}>A folder of books</MenuItem>
        <MenuSeparator />
        <MenuItem icon={Settings01Icon} onSelect={() => useStore.setState({ dialog: { kind: "settings" } })}>Settings</MenuItem>
      </Menu>
      <ThemeToggle />
      <IconButton label="Details" icon={SidebarRightIcon} active={settings.inspector} onClick={() => setSetting({ inspector: !settings.inspector })} />
    </header>
  );
}
