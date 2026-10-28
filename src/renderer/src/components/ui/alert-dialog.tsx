"use client";

import { useRef, useState, type ReactNode } from "react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { Button } from "./button";
import { cx } from "./cx";
import { Dialog, DialogFooter, DialogHeader } from "./dialog";
import { Icon } from "./icon";

/**
 * A dialog that asks before something happens. Focus starts on Cancel, so
 * Enter never confirms by accident, and Escape cancels. If onConfirm returns
 * a promise the confirm button waits on it, then the dialog closes.
 */
export function AlertDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  pendingLabel,
  cancelLabel = "Cancel",
  tone = "neutral",
  onConfirm,
  children,
}: {
  open: boolean;
  /** Runs on Cancel, Escape, a click outside, and after a confirm. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** Shown on the confirm button while it waits, like "Deleting". */
  pendingLabel?: string;
  cancelLabel?: string;
  /** danger for things that cannot be undone. */
  tone?: "neutral" | "danger";
  /** Can return a promise. If it throws, the dialog stays open. */
  onConfirm: () => void | Promise<unknown>;
  /** Anything between the text and the buttons, like a field to type a name. */
  children?: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  // Nothing closes it while a confirm is running.
  const close = () => {
    if (!pending) onClose();
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // The caller shows what went wrong. The dialog stays so they can retry.
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      label={title}
      role="alertdialog"
      initialFocus={cancel}
      className="max-w-[400px]"
    >
      <DialogHeader title={title} description={description} />
      {children && <div className="px-6 pt-5">{children}</div>}
      <DialogFooter>
        <Button ref={cancel} variant="outline" onClick={close} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          onClick={confirm}
          aria-busy={pending}
          className={cx(tone === "danger" && "bg-danger!", pending && "cursor-default")}
        >
          {pending && (
            <span className="flex animate-spin">
              <Icon icon={Loading03Icon} size={16} />
            </span>
          )}
          {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
