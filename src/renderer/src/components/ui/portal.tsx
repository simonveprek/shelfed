"use client";
// Fragms Personal kit, (c) 2026 Šimon Vepřek. Not MIT: only for use as part of Shelf. See LICENSE-FRAGMS-PERSONAL.md.

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noSubscribe = () => () => {};

/** Renders at the end of the page, so no parent clips it or holds it. */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return mounted ? createPortal(children, document.body) : null;
}
