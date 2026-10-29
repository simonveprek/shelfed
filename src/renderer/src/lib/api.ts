import type { Api } from "../../../main/index";
import { t } from "../../../shared/i18n";

type Bridge = {
  [K in keyof Api]: Api[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

declare global {
  interface Window {
    shelf: {
      call: (method: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, listener: (...args: any[]) => void) => () => void;
      pathForFile: (file: File) => string;
      platform: string;
    };
  }
}

/** Everything the main process offers, typed, as plain async calls. */
export const api = new Proxy({} as Bridge, {
  get: (_, method: string) => (...args: unknown[]) => window.shelf.call(method, ...args),
});

export const on = (channel: string, listener: (...args: any[]) => void) => window.shelf.on(channel, listener);

export const isMac = window.shelf.platform === "darwin";
export const isWin = window.shelf.platform === "win32";
export const mod = isMac ? "⌘" : "Ctrl+";
/** Shift in a shortcut, the way each system writes it. */
export const shift = isMac ? "⇧" : "Shift+";
/** Always English, since it is set when the file loads; revealText() gives it in the chosen language. */
export const revealLabel = isMac ? "Show in Finder" : isWin ? "Show in Explorer" : "Show in Folder";
/** "Show in Finder", or Explorer, or Folder, in the chosen language. */
export const revealText = () => t(revealLabel);
/** "Open in Finder", or Explorer, or Folder, in the chosen language: revealLabel with Open for Show. */
export const openInText = () => t(revealLabel.replace(/^Show in /, "Open in "));
