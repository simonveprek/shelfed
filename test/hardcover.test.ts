import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asker, connect, HardcoverError, revoke, sameBook, syncHardcover, whoAmI, type Library, type Tokens } from "../src/main/hardcover";
import type { Book } from "../src/shared/types";
import { entry, pretendHardcover, type PretendHardcover } from "./pretend-hardcover";

/*
 * Keeping reading in step with Hardcover, against a pretend Hardcover that
 * signs in, hands out keys and answers its API the way the real one does.
 */

let hc: PretendHardcover;

beforeEach(async () => {
  hc = await pretendHardcover();
  process.env.SHELF_HARDCOVER_API = hc.url;
  process.env.SHELF_HARDCOVER_AUTHORIZE = `${hc.url}/oauth2/authorize`;
  process.env.SHELF_HARDCOVER_ISSUER = hc.url;
  process.env.SHELF_HARDCOVER_CLIENT_ID = "shelfed-test";
  process.env.SHELF_HARDCOVER_GAP = "0";
});
afterEach(() => hc.close());

/** What a browser does with the sign-in page: follows it back to Shelfed. */
const browser = (url: string) => void fetch(url).catch(() => undefined);

async function signedIn() {
  let keys: Tokens | null = await connect(browser);
  const ask = asker({ get: () => keys, set: (next) => (keys = next) }, "0.4.0");
  return { ask, keys: () => keys! };
}

function book(id: string, title: string, author: string, patch: Partial<Book> = {}): Book {
  return { id, title, authors: [author], tags: [], collections: [], rating: 0, status: "unread", favorite: false, formats: [], dir: "", cover: 0, added: 0, modified: 0, ...patch };
}

/** A library as Shelfed keeps one, in memory, finishing a book the way it does. */
function shelf(books: Book[]): Library & { get: (id: string) => Book } {
  return {
    books: () => books,
    get: (id) => books.find((b) => b.id === id)!,
    update(id, patch) {
      const b = books.find((x) => x.id === id)!;
      if (patch.status === "finished" && b.status !== "finished") patch = { finishedAt: Date.now(), ...patch };
      Object.assign(b, patch);
      return b;
    },
  };
}

describe("connecting", () => {
  it("goes through Hardcover's page with PKCE, and comes back with keys that work", async () => {
    const { ask, keys } = await signedIn();
    expect(keys().access).toMatch(/^hc_at_/);
    expect(await whoAmI(ask)).toEqual({ id: 42, username: "reader" });
  });

  it("refuses an answer that isn't from Hardcover, or a no", async () => {
    hc.consent = "wrong-issuer";
    await expect(connect(browser)).rejects.toThrow(/wasn't from Hardcover/);
    hc.consent = "no";
    await expect(connect(browser)).rejects.toThrow(/wasn't allowed/);
  });

  it("isn't offered without Shelfed's id at Hardcover", async () => {
    process.env.SHELF_HARDCOVER_CLIENT_ID = "";
    await expect(connect(browser)).rejects.toThrow(/isn't set up/);
  });

  it("can be cancelled while waiting", async () => {
    const stop = new AbortController();
    const waiting = connect(() => stop.abort(), stop.signal);
    await expect(waiting).rejects.toThrow("Cancelled");
  });
});

describe("asking Hardcover", () => {
  it("renews keys that ran out, keeps the new ones, and never spends a refresh key twice", async () => {
    const { ask, keys } = await signedIn();
    const first = keys().refresh;
    hc.expire();
    expect(await whoAmI(ask)).toEqual({ id: 42, username: "reader" });
    expect(hc.refreshed).toBe(1);
    expect(keys().refresh).not.toBe(first);
    hc.expire();
    await whoAmI(ask);
    expect(hc.refreshed).toBe(2);
  });

  it("waits when told to slow down, then carries on", async () => {
    const { ask } = await signedIn();
    hc.failNext(429, { "Retry-After": "0" });
    expect(await whoAmI(ask)).toEqual({ id: 42, username: "reader" });
  });

  it("says so when the connection is gone, so it can be made again", async () => {
    const { ask, keys } = await signedIn();
    await revoke(keys());
    expect(hc.revoked).toEqual([keys().refresh]);
    const error = await whoAmI(ask).catch((e) => e);
    expect(error).toBeInstanceOf(HardcoverError);
    expect((error as HardcoverError).signedOut).toBe(true);
  });
});

describe("matching books", () => {
  it("by ISBN, or by title and an author's surname, whatever the case, accents or subtitle", () => {
    const remote = entry(1, "Leaders Eat Last: Why Some Teams Pull Together", "Simon Sinek", 2, { edition: { isbn_13: "9781591845324", pages: 368 } });
    expect(sameBook(book("a", "Leaders eat last", "Sinek, Simon".split(", ").reverse().join(" ")), remote)).toBe(true);
    expect(sameBook(book("b", "Something Else", "X", { isbn: "978-1-59184-532-4" }), remote)).toBe(true);
    expect(sameBook(book("c", "Leaders Eat Last", "Someone Else"), remote)).toBe(false);
    expect(sameBook(book("d", "Příliš žluťoučký kůň", "Petr Čapek"), entry(2, "Prilis zlutoucky kun", "Petr Capek", 1))).toBe(true);
  });
});

describe("keeping in step", () => {
  it("the first time, takes whichever side is further on, and a rating from wherever there is one", async () => {
    const { ask } = await signedIn();
    hc.library.push(
      entry(1, "Emma", "Jane Austen", 3, { rating: 4.5 }),
      entry(2, "Persuasion", "Jane Austen", 1),
      entry(3, "Middlemarch", "George Eliot", 5),
    );
    const lib = shelf([
      book("emma", "Emma", "Jane Austen", { status: "reading" }),
      book("pers", "Persuasion", "Jane Austen", { status: "finished", rating: 4 }),
      book("mid", "Middlemarch", "George Eliot", { status: "reading" }),
      book("only", "Only Here", "Nobody"),
    ]);
    const outcome = await syncHardcover(ask, lib, 42, new Set());
    expect(lib.get("emma")).toMatchObject({ status: "finished", rating: 5 });
    expect(lib.get("emma").finishedAt).toBeTypeOf("number");
    expect(hc.library[1]).toMatchObject({ status_id: 3, rating: 4 });
    // Didn't finish, there: left as it is on both sides.
    expect(hc.library[2].status_id).toBe(5);
    expect(lib.get("mid").status).toBe("reading");
    expect(lib.get("only").hardcover).toBeUndefined();
    expect(outcome).toMatchObject({ linked: 3, added: 0 });
  });

  it("after that, sends what changed here, brings what changed there, and Shelfed wins when both changed", async () => {
    const { ask } = await signedIn();
    hc.library.push(entry(1, "Emma", "Jane Austen", 2), entry(2, "Persuasion", "Jane Austen", 2), entry(3, "Sanditon", "Jane Austen", 2));
    const lib = shelf([
      book("emma", "Emma", "Jane Austen", { status: "reading" }),
      book("pers", "Persuasion", "Jane Austen", { status: "reading" }),
      book("sand", "Sanditon", "Jane Austen", { status: "reading" }),
    ]);
    await syncHardcover(ask, lib, 42, new Set());
    // Here: Emma finished and rated. There: Persuasion finished. Both: Sanditon.
    lib.update("emma", { status: "finished", rating: 3 });
    hc.library[1].status_id = 3;
    lib.update("sand", { status: "unread" });
    hc.library[2].status_id = 3;
    await syncHardcover(ask, lib, 42, new Set());
    expect(hc.library[0]).toMatchObject({ status_id: 3, rating: 3 });
    expect(lib.get("pers").status).toBe("finished");
    expect(hc.library[2].status_id).toBe(1);
    expect(lib.get("sand").status).toBe("unread");
    // And a third time, nothing moves, here or there.
    const asked = hc.asked.length;
    let touched = 0;
    const update = lib.update;
    lib.update = (id, patch) => (touched++, update(id, patch));
    const outcome = await syncHardcover(ask, lib, 42, new Set());
    expect(outcome).toMatchObject({ pulled: 0, pushed: 0, added: 0 });
    expect(hc.asked.slice(asked).map((a) => a.name)).toEqual(["Library"]);
    expect(touched).toBe(0);
  });

  it("tells Hardcover how far in a book being read is, in pages of its edition", async () => {
    const { ask } = await signedIn();
    hc.library.push(entry(1, "Emma", "Jane Austen", 2, { edition: { pages: 400 }, read: { id: 77, progress_pages: 0 } }));
    const lib = shelf([book("emma", "Emma", "Jane Austen", { status: "reading", progress: 0.25 })]);
    await syncHardcover(ask, lib, 42, new Set());
    expect(hc.library[0].read?.progress_pages).toBe(100);
    lib.update("emma", { progress: 0.5 });
    await syncHardcover(ask, lib, 42, new Set());
    expect(hc.library[0].read?.progress_pages).toBe(200);
  });

  it("adds books marked here since connecting, found by ISBN or by title, and says which it couldn't find", async () => {
    const { ask } = await signedIn();
    hc.catalogue.push(
      { id: 900, title: "Leaders Eat Last", author: "Simon Sinek", isbn13: "9781591845324", edition: 9001, pages: 368 },
      { id: 901, title: "The Time Machine", author: "H. G. Wells", edition: 9011, pages: 120 },
    );
    const lib = shelf([
      book("lel", "Leaders Eat Last", "Simon Sinek", { status: "finished", rating: 5, isbn: "9781591845324" }),
      book("tm", "The Time Machine", "H. G. Wells", { status: "reading" }),
      book("mine", "My Own Notes", "Me", { status: "finished" }),
      book("old", "Finished Long Ago", "Someone", { status: "finished" }),
    ]);
    const outcome = await syncHardcover(ask, lib, 42, new Set(["lel", "tm", "mine"]));
    expect(outcome.added).toBe(2);
    expect(outcome.notFound).toEqual(["My Own Notes"]);
    expect(hc.library.find((e) => e.book_id === 900)).toMatchObject({ status_id: 3, rating: 5, edition: { id: 9001 } });
    expect(hc.library.find((e) => e.book_id === 901)).toMatchObject({ status_id: 2 });
    expect(lib.get("lel").hardcover).toMatchObject({ book: 900, status: 3 });
    // Not marked since connecting, so not sent.
    expect(hc.asked.some((a) => JSON.stringify(a.variables).includes("Finished Long Ago"))).toBe(false);
  });

  it("lets a link go when the book is taken out of the library at Hardcover, and leaves the book here as it was", async () => {
    const { ask } = await signedIn();
    hc.library.push(entry(1, "Emma", "Jane Austen", 3));
    const lib = shelf([book("emma", "Emma", "Jane Austen", { status: "finished" })]);
    await syncHardcover(ask, lib, 42, new Set());
    hc.library.length = 0;
    await syncHardcover(ask, lib, 42, new Set());
    expect(lib.get("emma")).toMatchObject({ status: "finished", hardcover: undefined });
  });
});
