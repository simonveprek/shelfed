import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { t } from "../shared/i18n";

// Runs in a worker, so a long book never holds up the window. The converter
// sees only the folder it works in, as /work.
const WORKER = `
const { workerData, parentPort } = require("node:worker_threads");
const { closeSync, openSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { WASI } = require("node:wasi");
(async () => {
  const { wasm, dir, title, author } = workerData;
  const log = openSync(join(dir, "log.txt"), "w");
  const wasi = new WASI({
    version: "preview1",
    args: ["azw3", "/work/in.epub", "/work/out.azw3", title, author],
    preopens: { "/work": dir },
    stdout: log,
    stderr: log,
    returnOnExit: true,
  });
  const instance = await WebAssembly.instantiate(await WebAssembly.compile(readFileSync(wasm)), wasi.getImportObject());
  const code = wasi.start(instance);
  closeSync(log);
  parentPort.postMessage({ code });
})().catch((error) => parentPort.postMessage({ code: -1, error: String((error && error.message) || error) }));
`;

/**
 * Makes a Kindle AZW3 from an EPUB, for copying by cable. Returns the new
 * file's bytes. wasm is the converter, built from tools/azw3. The conversion
 * is seapy/kindle-cli's on leotaku/mobi, both MIT.
 */
export async function epubToAzw3(wasm: string, epub: string, title: string, author: string): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "shelf-azw3-"));
  try {
    await copyFile(epub, join(dir, "in.epub"));
    const { code, error } = await new Promise<{ code: number; error?: string }>((resolve, reject) => {
      const worker = new Worker(WORKER, { eval: true, workerData: { wasm, dir, title, author } });
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (exit) => exit && reject(new Error(t("The converter stopped with code {code}", { code: String(exit) }))));
    });
    if (code !== 0) {
      const log = await readFile(join(dir, "log.txt"), "utf8").catch(() => "");
      const reason = error ?? log.split(/\r?\n/).filter((line) => line && !line.startsWith("warning:")).at(-1);
      throw new Error(reason ? t("Couldn't make the Kindle file: {reason}", { reason }) : t("Couldn't make the Kindle file."));
    }
    return await readFile(join(dir, "out.azw3"));
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}
