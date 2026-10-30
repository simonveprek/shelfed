import { toast } from "@/components/ui";
import type { FreeBook } from "../../../shared/types";
import { importPaths } from "./actions";
import { api } from "./api";
import { norm } from "./util";
import { startJob } from "./store";
import { t, tn } from "../../../shared/i18n";

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

const summaries = new Map<string, Promise<string | null>>();

/** What a free book is about, looked up once per session. Null when nobody says, or can't be reached. */
export function findSummary(book: FreeBook) {
  if (book.summary) return Promise.resolve(book.summary);
  if (!summaries.has(book.id))
    summaries.set(
      book.id,
      api.freeSummary(book.id).catch(() => {
        summaries.delete(book.id);
        return null;
      }),
    );
  return summaries.get(book.id)!;
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

/**
 * A first shelf for an empty library: classics in Standard Ebooks' careful
 * editions, with their covers, so the bookcase, the reader and the Kindle all
 * have something to show from the first minute. R.U.R. is the play that gave
 * the world the word "robot", for anyone reading in Czech.
 */
const FIRST_SHELF: Array<[title: string, author: string]> = [
  ["Pride and Prejudice", "Jane Austen"],
  ["The Adventures of Sherlock Holmes", "Arthur Conan Doyle"],
  ["Dracula", "Bram Stoker"],
  ["The Great Gatsby", "F. Scott Fitzgerald"],
  ["Frankenstein", "Mary Shelley"],
  ["Alice's Adventures in Wonderland", "Lewis Carroll"],
  ["The Picture of Dorian Gray", "Oscar Wilde"],
  ["R.U.R.", "Karel Čapek"],
];

/** Fetches the first shelf and adds it, three books at a time. Says so if the internet isn't there. */
export async function startWithClassics() {
  const job = startJob(t("Fetching a few classics"));
  const paths: string[] = [];
  let done = 0;
  const queue = [...FIRST_SHELF];
  const fetchOne = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [title, author] = next;
      const last = norm(author).split(" ").pop() ?? "";
      const list = await api.freeBooks("standard", `${title} ${last}`).catch(() => [] as FreeBook[]);
      const book = list.find((b) => norm(b.title) === norm(title) && norm(b.author).includes(last));
      if (book) {
        const path = await api.downloadBook(book.epub, book.title).catch(() => null);
        if (path) paths.push(path);
      }
      done++;
      job.update({ progress: done / FIRST_SHELF.length, detail: tn(done, "{n} of {total}", "{n} of {total}", { total: FIRST_SHELF.length }) });
    }
  };
  await Promise.all([fetchOne(), fetchOne(), fetchOne()]);
  if (!paths.length) {
    job.fail(new Error(t("Couldn't reach Standard Ebooks. Check the internet and try again.")));
    return;
  }
  job.done(tn(paths.length, "Fetched {n} classic", "Fetched {n} classics"));
  try {
    await importPaths(paths);
  } finally {
    for (const path of paths) api.forgetDownload(path);
  }
}
