import { useEffect, useState } from "react";
import type { KindleOnUsb } from "../../../shared/types";
import { kindleById } from "../../../shared/kindles";
import { api } from "./api";
import { setSetting, useStore } from "./store";

/**
 * Watches for Kindles on USB while mounted. The first one Shelf recognises
 * becomes your Kindle, unless you picked one by hand.
 */
export function useKindlesOnUsb() {
  const [found, setFound] = useState<KindleOnUsb[] | null>(null);
  useEffect(() => {
    let alive = true;
    const look = async () => {
      const kindles = await api.kindles().catch(() => [] as KindleOnUsb[]);
      if (!alive) return;
      setFound(kindles);
      const known = kindleById(kindles.find((k) => k.model)?.model);
      const current = useStore.getState().settings.kindle;
      if (known && !current.picked && current.model !== known.id) setSetting({ kindle: { ...current, model: known.id, finish: known.finishes[0] } });
    };
    look();
    const timer = setInterval(look, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return found;
}
