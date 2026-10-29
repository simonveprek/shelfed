import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useVelocity } from "framer-motion";
import { FINISHES, kindleById } from "../../../shared/kindles";
import { Aura, AURA_PALETTES, type AuraColors } from "@/components/fragms/aura";
import { EASE } from "@/components/ui";
import { PHONE_LIKE, useOnKindle } from "@/lib/kindle";
import { useStore } from "@/lib/store";
import { isMac } from "@/lib/api";
import { bytes } from "@/lib/util";
import { Kindle3D } from "./Kindle3D";

const done = () => useStore.setState({ kindleArrived: null });

/** How long the welcome stays before the Kindle settles into the side panel. */
const STAY = 3200;

/** A colour mixed toward white, so a dark finish still glows. */
function lift(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0");
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** Plain black, grey and white Kindles glow in the aurora; coloured ones in their own colour, with it. */
function glowFor(finish?: string): AuraColors {
  const hex = FINISHES[finish ?? ""]?.hex;
  const [r, g, b] = hex ? [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) : [0, 0, 0];
  const colourful = hex && Math.max(r, g, b) - Math.min(r, g, b) > 28;
  if (!colourful) return AURA_PALETTES.aurora;
  const [, purple, , gold] = AURA_PALETTES.aurora;
  return [lift(hex, 0.25), purple, lift(hex, 0.5), gold];
}

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
  const cable = useStore((s) => s.kindleCable);
  const copied = useOnKindle()?.size ?? 0;

  // The edge of the window answers the Kindle: its speed as it rises, and
  // every pulse it gives, the plug going in, the screen waking, a tap.
  const y = useMotionValue(380);
  const speed = useVelocity(y);
  const pulse = useRef({ strength: 0, at: 0 });
  const onPulse = useCallback((strength: number) => {
    const now = performance.now();
    const left = pulse.current.strength * Math.exp(-(now - pulse.current.at) / 520);
    pulse.current = { strength: Math.min(1, Math.max(left, strength)), at: now };
  }, []);
  const level = useCallback(() => {
    const now = performance.now();
    const moving = Math.min(0.55, Math.abs(speed.get()) / 2400);
    const struck = pulse.current.strength * Math.exp(-(now - pulse.current.at) / 520);
    const waiting = 0.16 + 0.05 * Math.sin(now / 520);
    return Math.min(1, Math.max(moving, struck, waiting));
  }, [speed]);

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
          {/* Light along the window's edges, answering the Kindle. */}
          <Aura fixed level={level} palette={glowFor(kindle.finish)} intensity={1.15} radius={isMac ? 12 : 8} />
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
            style={{ transformPerspective: 1200, y }}
            // Clicks on the Kindle are its own, a tap that wakes the screen, not a way out.
            onClick={(e) => e.stopPropagation()}
          >
            <Kindle3D model={model} finish={kindle.finish} book={plugged ? reading : undefined} height={300} cable={plugged ? "plugged" : "unplugged"} onPulse={onPulse} />
          </motion.div>
          <motion.div
            className="-mt-6 flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={plugged ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <p className="text-[22px] leading-tight font-medium tracking-[-0.02em]">{model.name}</p>
            <p className="mt-1 text-label text-muted">
              {drive ? `Plugged in, ${bytes(drive.free)} free${copied ? `, ${copied} of your books on it` : ""}` : "Plugged in"}
            </p>
            {cable === "phone" ? (
              <p className="mt-4 max-w-[34rem] text-caption text-muted" style={{ textWrap: "balance" }}>{PHONE_LIKE}</p>
            ) : (
              <p className="mt-4 text-caption text-muted">{panel ? "Drop books on it in the side panel" : "Drag books onto it to copy them"}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
