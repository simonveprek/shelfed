import { Component, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Button, EASE, ThemeProvider, Toaster, toast } from "@/components/ui";
import { importPaths } from "@/lib/actions";
import type { UpdateState } from "../../shared/types";
import { api, isMac, isWin, on } from "@/lib/api";
import { runCommand } from "@/lib/commands";
import { hydrate, persist, useStore } from "@/lib/store";
import { AppSidebar, Header } from "@/components/Shell";
import { LibraryView } from "@/components/Library";
import { Inspector } from "@/components/Inspector";
import { ConvertDialog, EditDialog, RemoveConfirm, RenameCollection, SendDialog } from "@/components/Dialogs";
import { MetadataDialog } from "@/components/Metadata";
import { SettingsDialog } from "@/components/Settings";
import { DropZone, Jobs, Palette } from "@/components/Overlays";
import { Reader, saveProgress } from "@/reader/Reader";
import { Onboarding } from "@/components/Onboarding";
import { ClippingsDialog } from "@/components/Clippings";
import { KindleArrival } from "@/components/KindleArrival";
import { useKindleWatch } from "@/lib/kindle";

/** Keeps the window's own colour in step with light and dark. */
function Appearance() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!useStore.getState().reading) api.appearance(resolvedTheme === "dark");
  }, [resolvedTheme]);
  useEffect(() => {
    document.documentElement.classList.toggle("mac", isMac);
    document.documentElement.classList.toggle("win", isWin);
  }, []);
  return null;
}

function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case "send":
      return <SendDialog ids={dialog.ids} />;
    case "convert":
      return <ConvertDialog ids={dialog.ids} />;
    case "metadata":
      return <MetadataDialog key={dialog.ids[0]} id={dialog.ids[0]} />;
    case "edit":
      return <EditDialog key={dialog.ids[0]} id={dialog.ids[0]} />;
    case "settings":
      return <SettingsDialog tab={dialog.tab} />;
    case "rename-collection":
      return <RenameCollection key={dialog.id} id={dialog.id} />;
    case "clippings":
      return <ClippingsDialog text={dialog.text} from={dialog.from} />;
  }
}

/** Looks out for Kindles for the whole app, once it has its settings. */
function KindleWatch() {
  useKindleWatch();
  return null;
}

/** A new version, said once when it's ready or out. */
function announce(update: UpdateState) {
  const before = useStore.getState().update;
  useStore.setState({ update });
  if (before.state === update.state) return;
  if (update.state === "ready")
    toast(`Shelfed ${update.version} is ready`, {
      description: "It goes in when Shelfed next starts.",
      duration: 15_000,
      action: { label: "Restart now", onClick: () => api.installUpdate() },
    });
  if (update.state === "available")
    toast(`Shelfed ${update.version} is out`, {
      description: "Download it from GitHub.",
      duration: 15_000,
      action: { label: "Download", onClick: () => api.installUpdate() },
    });
}

/** If a screen breaks, say so and offer a way back, rather than leave the window empty. */
class Mend extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("Shelfed hit an error:", error);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="text-heading">Something went wrong</p>
        <p className="mt-2 max-w-[440px] text-label text-muted">Your books are safe. Shelfed hit an error drawing this screen.</p>
        <pre className="selectable mt-4 max-w-[560px] rounded-[10px] bg-well px-3 py-2 text-left text-caption whitespace-pre-wrap text-muted">{error.message}</pre>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button onClick={() => location.reload()}>Reload</Button>
          <Button
            onClick={() => {
              const { version, platform } = useStore.getState();
              navigator.clipboard.writeText(`Shelfed ${version} on ${platform}\n\n${error.stack ?? error.message}`);
              toast.success("Copied, ready to paste into a bug report");
            }}
          >
            Copy details
          </Button>
        </div>
      </div>
    );
  }
}

function Library() {
  const inspector = useStore((s) => s.settings.inspector);
  // The library steps back while a Kindle that was just plugged in says hello.
  const welcoming = useStore((s) => Boolean(s.kindleArrived && !s.reading && !s.onboarding && !s.dialog));
  return (
    <motion.div
      className="flex h-full"
      style={{ transformOrigin: "50% 65%" }}
      initial={false}
      animate={
        welcoming
          ? { scale: 0.94, filter: "blur(6px) brightness(0.72)", borderRadius: 18 }
          : // Back to no filter at all after, which would otherwise pin fixed things inside to this box.
            { scale: 1, filter: "blur(0px) brightness(1)", borderRadius: 0, transitionEnd: { filter: "none" } }
      }
      transition={{ duration: 0.7, ease: EASE }}
    >
      <AppSidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <LibraryView />
          </div>
          {inspector && <Inspector />}
        </div>
      </main>
    </motion.div>
  );
}

export function App() {
  const ready = useStore((s) => s.ready);

  useEffect(() => {
    api
      .boot()
      .then((state) => {
        hydrate(state);
        api.ready();
      })
      .catch((error) => toast.error(String(error.message)));
    const offs = [
      on("command", runCommand),
      on("open-files", (paths: string[]) => importPaths(paths, paths.length === 1)),
      on("save-failed", () => toast.error("Shelfed could not save your library", { description: "Your changes are kept and it will try again. Check the disk has room." })),
      on("update", announce),
    ];
    api.updateState().then((update) => useStore.setState({ update }));
    const key = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const tag = (e.target as HTMLElement).tagName;
      if (s.onboarding) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !s.reading) {
        e.preventDefault();
        useStore.setState({ palette: !s.palette });
        return;
      }
      if (s.reading || s.dialog || s.palette || tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) && s.selection.length) {
        e.preventDefault();
        useStore.setState({ confirmRemove: s.selection });
      }
    };
    window.addEventListener("keydown", key);
    const flush = () => {
      saveProgress.flush();
      persist.flush();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      offs.forEach((off) => off());
      window.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Appearance />
      {ready && (
        <Mend>
          <KindleWatch />
          <Library />
          <KindleArrival />
          <Reader />
          <Dialogs />
          <Palette />
          <RemoveConfirm />
          <Jobs />
          <DropZone />
          <Onboarding />
        </Mend>
      )}
      <Toaster />
    </ThemeProvider>
  );
}
