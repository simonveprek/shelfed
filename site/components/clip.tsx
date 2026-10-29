"use client";

import { useEffect, useRef } from "react";
import { asset } from "@/lib";

/**
 * A recording of the app. It loads and plays only while it's on screen, so
 * a long page of them stays light, and holds still for reduced motion.
 */
export function Clip({ name, label, className = "" }: { name: string; label: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) element.play().catch(() => {});
        else element.pause();
      },
      { threshold: 0.35 },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  return (
    <video
      ref={video}
      className={`block h-auto w-full ${className}`}
      src={asset(`media/${name}.mp4`)}
      poster={asset(`media/${name}.jpg`)}
      aria-label={label}
      muted
      loop
      playsInline
      preload="none"
      width={1280}
      height={800}
    />
  );
}
