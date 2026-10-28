import { toast } from "@/components/ui";
import type { FreeBook } from "../../../shared/types";
import { importPaths } from "./actions";
import { api } from "./api";
import { norm } from "./util";

const found = new Map<string, Promise<FreeBook | null>>();

/** The Project Gutenberg edition of a classic, looked up once per session. */
export function findFree(title: string, author: string) {
  const key = `${title}|${author}`;
  if (!found.has(key)) {
    const last = author.split(" ").pop() ?? "";
    const want = norm(title).split(" ").slice(0, 3).join(" ");
    found.set(
      key,
      api
        .freeBooks("gutenberg", `${title} ${last}`)
        // The first result whose title starts like the one asked for, so a study of it doesn't win.
        .then((list) => list.find((b) => norm(b.title).startsWith(want)) ?? null)
        .catch(() => {
          found.delete(key);
          return null;
        }),
    );
  }
  return found.get(key)!;
}

/** Downloads a free book and adds it to the library. */
export async function addFree(book: FreeBook) {
  let path: string | null = null;
  try {
    path = await api.downloadBook(book.epub, book.title);
    await importPaths([path]);
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  } finally {
    // The library has its own copy now.
    if (path) api.forgetDownload(path);
  }
}
