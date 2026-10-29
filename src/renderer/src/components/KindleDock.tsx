import { useRef, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import { kindleById } from "../../../shared/kindles";
import { sendByCable } from "@/lib/actions";
import { isMac } from "@/lib/api";
import { useFinishedOnKindle, useKindlePort, useOnKindle } from "@/lib/kindle";
import { BOOK_MIME } from "@/lib/select";
import { useStore } from "@/lib/store";
import { bytes } from "@/lib/util";
import { t, tn } from "../../../shared/i18n";
import { EASE, Panel } from "@/components/ui";
import { Portal } from "@/components/ui/portal";
import { Cover } from "./Cover";
import { Kindle3D } from "./Kindle3D";

/** True when there's a Kindle to show: one you've picked, or one plugged in. */
export function useHasKindle() {
  return useStore((s) => Boolean(s.settings.kindle.model));
}

/**
 * Your Kindle, in 3D, waiting for books. Drop one on it to copy it by cable
 * when it's plugged in, or to email it when it isn't.
 */
export function KindleDock() {
  const kindle = useStore((s) => s.settings.kindle);
  const carrying = useStore((s) => s.carrying);
  const books = useStore((s) => s.books);
  const port = useKindlePort();
  const usb = port?.usb;
  const drives = port?.drives ?? [];
  const [over, setOver] = useState(false);
  const [dropped, setDropped] = useState<string | null>(null);
  const activity = useStore((s) => s.kindleActivity);
  const device = useRef<HTMLDivElement>(null);
  // A dropped book's cover, flying from the pointer into the screen.
  const [flight, setFlight] = useState<{ id: string; from: [number, number]; to: [number, number] } | null>(null);

  const drive = drives[0];
  const onBus = Boolean(drive || usb?.length);
  const cable = useStore((s) => s.kindleCable);
  const copied = useOnKindle()?.size ?? 0;
  const finished = useFinishedOnKindle();
  const model = kindleById(kindle.model ?? drive?.model ?? usb?.find((k) => k.model)?.model) ?? (onBus ? kindleById("pw5") : undefined);
  if (!model) return null;

  const reading = books.filter((b) => b.status === "reading").sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0))[0];
  const shown = books.find((b) => b.id === (carrying?.[0] ?? activity?.bookId ?? dropped)) ?? reading;
  const flying = flight && books.find((b) => b.id === flight.id);
  const takes = (e: DragEvent) => e.dataTransfer.types.includes(BOOK_MIME);

  return (
    <Panel padded={false} className="px-4 pt-3.5 pb-5">
      <div
        className="flex flex-col items-center"
        onDragEnter={(e) => takes(e) && setOver(true)}
        onDragOver={(e) => {
          if (!takes(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
        onDrop={(e) => {
          if (!takes(e)) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          const ids = JSON.parse(e.dataTransfer.getData(BOOK_MIME)) as string[];
          const box = device.current?.getBoundingClientRect();
          setFlight({ id: ids[0], from: [e.clientX, e.clientY], to: box ? [box.left + box.width / 2, box.top + box.height * 0.36] : [e.clientX, e.clientY] });
          // Holds the Kindle on screen while the cover is in the air.
          useStore.setState({ kindleActivity: { via: drive ? "cable" : "email", bookId: ids[0], state: "arriving", progress: 0 } });
          // Once it has landed, the screen refreshes and the book goes.
          setTimeout(() => {
            setFlight(null);
            setDropped(ids[0]);
            if (drive) sendByCable(ids, drive.path);
            else useStore.setState({ kindleActivity: null, dialog: { kind: "send", ids } });
          }, 480);
        }}
      >
        <h3 className="self-start text-label font-medium text-muted">{t("Your Kindle")}</h3>
        <div ref={device}>
          <Kindle3D
            model={model}
            finish={kindle.finish}
            book={shown}
            activity={activity}
            height={model.size[1] > 200 ? 200 : 186}
            cable={onBus ? "plugged" : "unplugged"}
            glow={over}
            className="pt-2"
          />
        </div>
        {flying && flight && (
          <Portal>
            <motion.div
              className="pointer-events-none fixed top-0 left-0 z-[90] w-[64px]"
              initial={{ x: flight.from[0] - 32, y: flight.from[1] - 48, scale: 1, rotate: -8, opacity: 1 }}
              animate={{ x: flight.to[0] - 32, y: flight.to[1] - 48, scale: 0.4, rotate: 0, opacity: [1, 1, 0] }}
              transition={{ duration: 0.48, ease: EASE }}
            >
              <Cover book={flying} className="shadow-float" />
            </motion.div>
          </Portal>
        )}
        <p className="mt-1 text-label font-medium">{model.name}</p>
        <p className="mt-0.5 max-w-[26ch] text-center text-caption text-muted" style={{ textWrap: "balance" }}>
          {over
            ? drive
              ? t("Let go to copy it on")
              : t("Let go to send it by email")
            : drive
              ? `${t("Plugged in, {free} free.", { free: bytes(drive.free) })} ${copied ? `${tn(copied, "{n} of your books is on it.", "{n} of your books are on it.")} ` : ""}${t("Drop a book on it to copy it.")}`
              : cable === "phone"
                ? isMac
                  ? t("It connects like a phone, so a Mac can't copy books to it by cable. Drop a book on it to email it.")
                  : t("It connects like a phone, so Shelfed can't copy books to it by cable. Drop a book on it to email it.")
                : onBus
                  ? t("Plugged in. Waiting for it to open as a drive.")
                  : carrying
                  ? t("Drop it here to send it by email")
                  : t("Not plugged in. Drop a book on it to email it.")}
        </p>
        {drive && !over && finished && finished.books.length > 0 && (
          <button
            type="button"
            onClick={() => useStore.setState({ confirmTidy: true })}
            className="mt-2.5 rounded-full bg-control px-3 py-1 text-caption text-muted transition-colors hover:bg-control-hover hover:text-foreground"
          >
            {tn(finished.books.length, "{n} finished book on it, {size}. Take off", "{n} finished books on it, {size}. Take off", { size: bytes(finished.bytes) })}
          </button>
        )}
      </div>
    </Panel>
  );
}
