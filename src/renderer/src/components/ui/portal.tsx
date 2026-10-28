"use client";

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
