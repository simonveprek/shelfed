import type { ReactNode } from "react";
import { Aura } from "./aura";

/**
 * The app's window around a recording: rounded, lit at the rim, with the
 * traffic lights the recording leaves out. An aura can glow along its edge.
 */
export function AppWindow({ children, aura = false, className = "" }: { children: ReactNode; aura?: boolean; className?: string }) {
  const frame = (
    <div className="relative overflow-hidden rounded-[14px] bg-card shadow-[var(--shadow-window)] ring-1 ring-line-strong">
      {/* Where macOS draws them: 12 points across, 8 apart, 20 in and 18 down, on a 1280 wide window. */}
      <span aria-hidden className="absolute z-10 flex" style={{ left: "1.56%", top: "2.25%", width: "4.06%", gap: "0.625%" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
          <span key={color} className="aspect-square flex-1 rounded-full" style={{ background: color, boxShadow: "inset 0 0 0 0.5px rgb(0 0 0 / 0.2)" }} />
        ))}
      </span>
      {children}
    </div>
  );
  if (!aura) return <div className={className}>{frame}</div>;
  return (
    <Aura level={0.18} intensity={1.6} speed={0.6} radius={18} className={`rounded-[18px] p-1 ${className}`}>
      {frame}
    </Aura>
  );
}
