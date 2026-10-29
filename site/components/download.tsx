"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AppleIcon, Download04Icon, WindowsNewIcon } from "@hugeicons/core-free-icons";
import { installer, RELEASES, VERSION, type Arch, type System } from "@/lib";

type Found = { os: System; arch: Arch } | null;

/**
 * Which installer this visitor wants. A Mac doesn't say whether it's Apple
 * silicon, but its graphics chip does; Windows on ARM says so in its hints.
 */
function useSystem(): Found {
  const [found, setFound] = useState<Found>(null);
  useEffect(() => {
    const agent = navigator.userAgent;
    if (/Mac/i.test(agent) && !/iPhone|iPad/i.test(agent)) {
      let arch: Arch = "arm64";
      try {
        const gl = document.createElement("canvas").getContext("webgl");
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        const renderer = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        if (/Intel|AMD|Radeon/i.test(renderer)) arch = "x64";
      } catch {}
      setFound({ os: "mac", arch });
    } else if (/Windows/i.test(agent)) {
      setFound({ os: "win", arch: "x64" });
      const hints = (navigator as Navigator & { userAgentData?: { getHighEntropyValues: (k: string[]) => Promise<{ architecture?: string }> } }).userAgentData;
      hints?.getHighEntropyValues(["architecture"]).then((v) => v.architecture === "arm" && setFound({ os: "win", arch: "arm64" })).catch(() => {});
    }
  }, []);
  return found;
}

const NAMES = { mac: { arm64: "Apple silicon", x64: "Intel" }, win: { x64: "x64", arm64: "ARM" } };

/** The one button the hero needs: this visitor's installer, or the choices below. */
export function DownloadButton({ center = false }: { center?: boolean }) {
  const found = useSystem();
  return (
    <div className={`flex flex-col gap-2.5 ${center ? "items-center" : "items-start"}`}>
      <a
        href={found ? installer(found.os, found.arch) : "#download"}
        className="inline-flex h-12 items-center gap-2.5 rounded-full bg-foreground px-6 text-[15px] font-medium text-background transition-transform duration-200 ease-smooth hover:-translate-y-0.5 active:translate-y-0"
      >
        <HugeiconsIcon icon={found?.os === "win" ? WindowsNewIcon : found?.os === "mac" ? AppleIcon : Download04Icon} size={18} />
        {found ? `Download for ${found.os === "mac" ? "Mac" : "Windows"}` : "Download Shelf"}
      </a>
      <p className={`text-[13px] text-muted ${center ? "" : "pl-1"}`}>
        {found ? `${NAMES[found.os][found.arch]}, version ${VERSION}. ` : `Version ${VERSION}, for Mac and Windows. `}
        <a href="#download" className="underline decoration-line-strong underline-offset-4 hover:text-foreground">
          Other downloads
        </a>
      </p>
    </div>
  );
}

/** Every build, in a line, for anyone the button guessed wrong for. */
export function OtherBuilds() {
  const builds: Array<[System, Arch, string]> = [
    ["mac", "arm64", "Mac, Apple silicon"],
    ["mac", "x64", "Mac, Intel"],
    ["win", "x64", "Windows, x64"],
    ["win", "arm64", "Windows, ARM"],
  ];
  return (
    <p className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[14px] text-muted">
      {builds.map(([os, arch, label]) => (
        <a key={label} href={installer(os, arch)} className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-foreground">
          {label}
        </a>
      ))}
      <a href={RELEASES} className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-foreground">
        Every release
      </a>
    </p>
  );
}
