import { useEffect, useState } from "react";
import type { CalibreLibrary } from "../../../main/calibre";
import { api } from "./api";

/* ------------------------------------------------------------------------ */
/* Finding a Calibre library on this computer                               */
/* ------------------------------------------------------------------------ */

let found: Promise<CalibreLibrary[]> | null = null;

/** The Calibre libraries on this computer, looked for once. */
export const findCalibre = () => (found ??= api.findCalibre().catch(() => [] as CalibreLibrary[]));

/** The Calibre library Calibre itself opens first, once it has been looked for. */
export function useCalibre() {
  const [library, setLibrary] = useState<CalibreLibrary | null>(null);
  useEffect(() => {
    let alive = true;
    findCalibre().then((all) => alive && setLibrary(all[0] ?? null));
    return () => {
      alive = false;
    };
  }, []);
  return library;
}
