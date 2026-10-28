import { useEffect } from "react";
import type { KindleDevice, KindleOnUsb } from "../../../shared/types";
import { kindleById } from "../../../shared/kindles";
import { api, isWin } from "./api";
import { setSetting, useStore } from "./store";

/** In development, a pretend Kindle for trying out the plugged-in look: window.__fakeKindle = { usb, drives }. */
const pretend = () => (import.meta.env.DEV ? (window as unknown as { __fakeKindle?: { usb: KindleOnUsb[]; drives: KindleDevice[] } }).__fakeKindle : undefined);

/**
 * Watches the USB bus for Kindles, for the whole app, from one place. The
 * first one Shelf recognises becomes your Kindle, unless you picked one by
 * hand, and plugging one in gets it a welcome.
 */
export function useKindleWatch() {
  useEffect(() => {
    let alive = true;
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
        // Not for one already plugged in when Shelf opens, only for one arriving.
        ...(before && now && !was ? { kindleArrived: Date.now() } : {}),
      });
      const known = kindleById(usb.find((k) => k.model)?.model ?? drives.find((d) => d.model)?.model);
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
