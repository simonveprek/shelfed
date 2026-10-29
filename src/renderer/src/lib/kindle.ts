import { useEffect, useMemo } from "react";
import type { KindleDevice, KindleOnUsb } from "../../../shared/types";
import { connectsLikeAPhone, kindleById } from "../../../shared/kindles";
import { api, isMac, isWin } from "./api";
import { booksOnKindle, finishedOnKindle } from "./onkindle";
import { toast } from "@/components/ui";
import { bytes } from "./util";
import { t, tn } from "../../../shared/i18n";
import { setSetting, useStore } from "./store";

/** How long a Kindle Shelfed doesn't know may take to open as a drive before it's taken to be one that won't. */
const MOUNTING = 10_000;
/** How often the books on a Kindle are looked at again while it's plugged in. */
const RELIST = 15_000;

/** Reads the book files on the Kindle plugged in as a drive, now. */
export async function relistKindle() {
  const drive = useStore.getState().kindlePort?.drives[0];
  if (!drive) return useStore.setState({ kindleFiles: null });
  const files = await api.deviceFiles(drive.path).catch(() => null);
  if (files && useStore.getState().kindlePort?.drives[0]?.path === drive.path) useStore.setState({ kindleFiles: files });
}

/** In development, a pretend Kindle for trying out the plugged-in look: window.__fakeKindle = { usb, drives }. */
const pretend = () => (import.meta.env.DEV ? (window as unknown as { __fakeKindle?: { usb: KindleOnUsb[]; drives: KindleDevice[] } }).__fakeKindle : undefined);

/**
 * Watches the USB bus for Kindles, for the whole app, from one place. The
 * first one Shelfed recognises becomes your Kindle, unless you picked one by
 * hand, and plugging one in gets it a welcome.
 */
export function useKindleWatch() {
  useEffect(() => {
    let alive = true;
    let onUsbSince = 0;
    let listed = { path: "", at: 0 };
    const look = async () => {
      const fake = pretend();
      // A hidden window has no one to show a Kindle to; it looks again when it's back.
      if (document.hidden) return;
      const { usb, drives } = fake ?? (await api.kindlePort().catch(() => ({ usb: [] as KindleOnUsb[], drives: [] as KindleDevice[] })));
      if (!alive) return;
      const before = useStore.getState().kindlePort;
      const was = Boolean(before && (before.usb.length || before.drives.length));
      const now = Boolean(usb.length || drives.length);
      useStore.setState({
        kindlePort: { usb, drives },
        // Not for one already plugged in when Shelfed opens, only for one arriving.
        ...(before && now && !was ? { kindleArrived: Date.now() } : {}),
      });
      const known = kindleById(usb.find((k) => k.model)?.model ?? drives.find((d) => d.model)?.model);

      // A drive takes books by cable. One only on USB connects like a phone,
      // known from its model, or from not opening as a drive in good time.
      if (usb.length && !drives.length) onUsbSince ||= Date.now();
      else onUsbSince = 0;
      const cable = drives.length ? "drive" : !usb.length ? null : connectsLikeAPhone(known) || Date.now() - onUsbSince > MOUNTING ? "phone" : "waiting";
      if (useStore.getState().kindleCable !== cable) useStore.setState({ kindleCable: cable });

      // What's on it, when it arrives and every little while after.
      const drive = drives[0];
      if (!drive) {
        if (useStore.getState().kindleFiles) useStore.setState({ kindleFiles: null });
      } else if (drive.path !== listed.path || Date.now() - listed.at > RELIST) {
        listed = { path: drive.path, at: Date.now() };
        relistKindle();
      }

      const current = useStore.getState().settings.kindle;
      if (known && !current.picked && current.model !== known.id) setSetting({ kindle: { ...current, model: known.id, finish: known.finishes[0] } });
    };
    look();
    // Windows asks PowerShell, which takes a moment each time, so it looks less often.
    const timer = setInterval(look, isWin ? 5000 : 2500);
    document.addEventListener("visibilitychange", look);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, []);
}

/** The Kindles plugged in right now, as last seen. */
export const useKindlePort = () => useStore((s) => s.kindlePort);

/** The books already on the Kindle plugged in as a drive, or null when there's none. */
export function useOnKindle(): Set<string> | null {
  const files = useStore((s) => s.kindleFiles);
  const books = useStore((s) => s.books);
  return useMemo(() => (files ? booksOnKindle(books, files.map((f) => f.name)) : null), [files, books]);
}

/** Finished books still on the Kindle plugged in as a drive, to offer taking them off. */
export function useFinishedOnKindle() {
  const files = useStore((s) => s.kindleFiles);
  const books = useStore((s) => s.books);
  return useMemo(() => (files ? finishedOnKindle(books, files) : null), [files, books]);
}

/** Takes the finished books off the Kindle, after asking. They stay in the library. */
export async function tidyKindle() {
  const drive = useStore.getState().kindlePort?.drives[0];
  const files = useStore.getState().kindleFiles;
  if (!drive || !files) return;
  const { books, files: theirs } = finishedOnKindle(useStore.getState().books, files);
  if (!theirs.length) return;
  const freed = await api.removeFromDevice(drive.path, theirs.map((f) => f.path));
  await relistKindle();
  toast.success(tn(books.length, "Took {n} finished book off your Kindle", "Took {n} finished books off your Kindle"), {
    description: t("{size} free again. They're still in your library.", { size: bytes(freed) }),
  });
}

const PHONE_LIKE_MAC = "This Kindle connects like a phone, and a Mac can't open it as a drive, so Shelfed can't copy books to it by cable. Send them by email instead.";
const PHONE_LIKE_OTHER = "This Kindle connects like a phone, not as a drive, so Shelfed can't copy books to it by cable yet. Send them by email instead.";

/**
 * Why a Kindle on the cable can't take books that way, said plainly for this
 * system. Always English, since it is set when the file loads; phoneLike() gives it in the chosen language.
 */
export const PHONE_LIKE = isMac ? PHONE_LIKE_MAC : PHONE_LIKE_OTHER;

/** PHONE_LIKE in the chosen language, asked for when it is shown. */
export const phoneLike = () => t(isMac ? PHONE_LIKE_MAC : PHONE_LIKE_OTHER);
/** The same as phoneLike(), under another name. */
export const PHONE_LIKE_TEXT = phoneLike;
