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
export function DownloadButton() {
  const found = useSystem();
  return (
    <div className="flex flex-col items-start gap-2">
      <a
        href={found ? installer(found.os, found.arch) : "#download"}
        className="inline-flex h-12 items-center gap-2.5 rounded-full bg-foreground px-6 text-[15px] font-medium text-background transition-transform duration-200 ease-smooth hover:-translate-y-0.5 active:translate-y-0"
      >
        <HugeiconsIcon icon={found?.os === "win" ? WindowsNewIcon : found?.os === "mac" ? AppleIcon : Download04Icon} size={18} />
        {found ? `Download for ${found.os === "mac" ? "Mac" : "Windows"}` : "Download Shelf"}
      </a>
      <p className="pl-1 text-[13px] text-muted">
        {found ? `${NAMES[found.os][found.arch]}, version ${VERSION}. ` : `Version ${VERSION}, for Mac and Windows. `}
        <a href="#download" className="underline decoration-line-strong underline-offset-4 hover:text-foreground">
          Other downloads
        </a>
      </p>
    </div>
  );
}

/** Both systems, every build, for anyone the button guessed wrong for. */
export function DownloadCards() {
  const found = useSystem();
  const systems: Array<{ os: System; title: string; icon: typeof AppleIcon; builds: Array<{ arch: Arch; label: string; note: string }> }> = [
    {
      os: "mac",
      title: "macOS",
      icon: AppleIcon,
      builds: [
        { arch: "arm64", label: "Apple silicon", note: "M1 and later" },
        { arch: "x64", label: "Intel", note: "Macs from before 2021" },
      ],
    },
    {
      os: "win",
      title: "Windows",
      icon: WindowsNewIcon,
      builds: [
        { arch: "x64", label: "x64", note: "Most PCs" },
        { arch: "arm64", label: "ARM", note: "Snapdragon laptops" },
      ],
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {systems.map((system) => (
        <div key={system.os} className="rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5">
            <HugeiconsIcon icon={system.icon} size={20} />
            <h3 className="text-[17px] font-medium">{system.title}</h3>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            {system.builds.map((build) => {
              const yours = found?.os === system.os && found.arch === build.arch;
              return (
                <a
                  key={build.arch}
                  href={installer(system.os, build.arch)}
                  className={`group flex items-center justify-between rounded-[14px] px-4 py-3 transition-colors duration-150 ${yours ? "bg-foreground text-background" : "bg-control hover:bg-control-hover"}`}
                >
                  <span>
                    <span className="block text-[15px] font-medium">{build.label}</span>
                    <span className={`block text-[13px] ${yours ? "opacity-70" : "text-muted"}`}>{yours ? "Looks like yours" : build.note}</span>
                  </span>
                  <HugeiconsIcon icon={Download04Icon} size={18} className="transition-transform duration-200 group-hover:translate-y-0.5" />
                </a>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[13px] text-muted sm:col-span-2">
        Version {VERSION}.{" "}
        <a href={RELEASES} className="underline decoration-line-strong underline-offset-4 hover:text-foreground">
          What's new, and every release
        </a>
      </p>
    </div>
  );
}
