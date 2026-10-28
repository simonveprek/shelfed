import { useEffect } from "react";
import { useTheme } from "next-themes";
import { ThemeProvider, Toaster, toast } from "@/components/ui";
import { importPaths } from "@/lib/actions";
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

function Library() {
  const inspector = useStore((s) => s.settings.inspector);
  return (
    <div className="flex h-full">
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
    </div>
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
      on("save-failed", () => toast.error("Shelf could not save your library", { description: "Your changes are kept and it will try again. Check the disk has room." })),
    ];
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
        <>
          <Library />
          <Reader />
          <Dialogs />
          <Palette />
          <RemoveConfirm />
          <Jobs />
          <DropZone />
          <Onboarding />
        </>
      )}
      <Toaster />
    </ThemeProvider>
  );
}
