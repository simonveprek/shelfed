import type { Api } from "../../../main/index";

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
export const mod = isMac ? "⌘" : "Ctrl ";
export const revealLabel = isMac ? "Show in Finder" : isWin ? "Show in Explorer" : "Show in Folder";
