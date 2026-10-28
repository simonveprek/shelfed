import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { kindleById } from "../../../shared/kindles";
import { EASE } from "@/components/ui";
import { useStore } from "@/lib/store";
import { bytes } from "@/lib/util";
import { Kindle3D } from "./Kindle3D";

const done = () => useStore.setState({ kindleArrived: null });

/** How long the welcome stays before the Kindle settles into the side panel. */
const STAY = 3200;

/**
 * A Kindle being plugged in gets the whole window: the library steps back,
 * the Kindle rises with its cable, the plug goes in, and its screen wakes on
 * the book you're reading. Then it flies off to wait in the side panel.
 */
export function KindleArrival() {
  const arrived = useStore((s) => s.kindleArrived);
  const busy = useStore((s) => Boolean(s.reading || s.onboarding || s.dialog));
  const kindle = useStore((s) => s.settings.kindle);
  const port = useStore((s) => s.kindlePort);
  const books = useStore((s) => s.books);
  const panel = useStore((s) => s.settings.inspector);
  const [plugged, setPlugged] = useState(false);

  const drive = port?.drives[0];
  const model = kindleById(kindle.model ?? drive?.model ?? port?.usb.find((k) => k.model)?.model) ?? kindleById("pw5")!;
  const reading = books.filter((b) => b.status === "reading").sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0))[0];

  const dismiss = useCallback(() => done(), []);

  useEffect(() => {
    if (!arrived) return;
    // Not over a book being read or a dialog being filled in.
    if (busy) return done();
    setPlugged(false);
    const plug = setTimeout(() => setPlugged(true), 750);
    const leave = setTimeout(done, STAY);
    const key = (e: KeyboardEvent) => e.key === "Escape" && done();
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(plug);
      clearTimeout(leave);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  // Where the side panel's Kindle sits, roughly, to fly off toward.
  const away = panel ? { x: window.innerWidth / 2 - 170, y: -window.innerHeight / 2 + 250, scale: 0.42 } : { x: 0, y: 120, scale: 0.6 };

  return (
    <AnimatePresence>
      {arrived && !busy && (
        <motion.div
          key={arrived}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden"
          onClick={dismiss}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, delay: 0.25 } }}
        >
          {/* A glow rising from below, where the cable comes from. */}
          <motion.div
            className="pointer-events-none absolute left-1/2 -bottom-[45%] size-[1000px] -translate-x-1/2 rounded-full"
            style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 30%, transparent), transparent)" }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, ease: EASE }}
          />
          {/* A ring going out from it the moment the plug goes in. */}
          {plugged && (
            <motion.span
              className="pointer-events-none absolute size-[320px] rounded-full border-2"
              style={{ borderColor: "var(--accent)", top: "calc(50% - 230px)" }}
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
          )}
          <motion.div
            initial={{ y: 380, rotateX: 28, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, rotateX: 0, opacity: 1, scale: 1 }}
            exit={{ ...away, opacity: 0, transition: { duration: 0.65, ease: EASE } }}
            transition={{ type: "spring", stiffness: 80, damping: 15 }}
            style={{ transformPerspective: 1200 }}
          >
            <Kindle3D model={model} finish={kindle.finish} book={plugged ? reading : undefined} height={300} cable={plugged ? "plugged" : "unplugged"} />
          </motion.div>
          <motion.div
            className="-mt-6 flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={plugged ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <p className="text-[22px] leading-tight font-medium tracking-[-0.02em]">{model.name}</p>
            <p className="mt-1 text-label text-muted">{drive ? `Plugged in, ${bytes(drive.free)} free` : "Plugged in"}</p>
            <p className="mt-4 text-caption text-muted">{panel ? "Drop books on it in the side panel" : "Drag books onto it to copy them"}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
