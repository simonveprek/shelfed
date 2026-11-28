import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Book, ReadStatus } from "../shared/types";
import { t } from "../shared/i18n";

/*
 * Hardcover, the place some people keep what they read, kept in step with
 * Shelfed once someone connects their own account. Nothing happens until
 * then, and it only ever talks to that account.
 *
 * Connecting goes through Hardcover's own page in the browser (OAuth with
 * PKCE, caught on a port on this computer), as Hardcover asks of any app;
 * Shelfed never sees a password or asks for a key to be pasted. Then each
 * book Shelfed has and Hardcover has is matched up, and its status, rating
 * and how far in it is go whichever way they changed. Hardcover keeps pages
 * read, not a place in a book, so a book still opens where Shelfed left it.
 *
 * Everything here takes what it needs from outside, so tests can stand in
 * for Hardcover and for the library.
 */

/**
 * Shelfed's id as an app at Hardcover, from its Developer Apps page: a public
 * app for desktops, with http://127.0.0.1/callback as its redirect, and
 * the device grant off. Public by design: PKCE, not a secret, proves it's Shelfed.
 */
export const HARDCOVER_CLIENT_ID = "fa891336-a453-46ac-adea-e4728bd48ea8";

export const clientId = () => process.env.SHELF_HARDCOVER_CLIENT_ID ?? HARDCOVER_CLIENT_ID;

/** Where Hardcover is. Tests point these at a pretend one. */
const API = () => process.env.SHELF_HARDCOVER_API ?? "https://api.hardcover.app";
const AUTHORIZE = () => process.env.SHELF_HARDCOVER_AUTHORIZE ?? "https://hardcover.app/oauth2/authorize";
const ISSUER = () => process.env.SHELF_HARDCOVER_ISSUER ?? "https://api.hardcover.app";

/** Only what keeping reading in step needs: who you are, your library to read and change, and finding a book. */
export const SCOPES = "read:me:content read:library write:library read:catalog:search read:catalog:data";

export type Tokens = { access: string; refresh: string; expires: number };

/* ------------------------------------------------------------------------ */
/* Connecting                                                                */
/* ------------------------------------------------------------------------ */

const base64url = (data: Buffer) => data.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const PAGE = (title: string, line: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px -apple-system,system-ui,sans-serif;background:#f6f5f1;color:#1d1b18;display:grid;place-items:center;height:100vh;margin:0}
main{text-align:center;max-width:28em;padding:2em}h1{font-size:22px;font-weight:600;margin:0 0 .5em}p{color:#77716a;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${line}</p></main></body></html>`;

/** What a token request answered. */
type TokenAnswer = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function tokenRequest(form: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${API()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenAnswer;
  if (!res.ok || !body.access_token || !body.refresh_token) throw new HardcoverError(body.error_description ?? body.error ?? `HTTP ${res.status}`, res.status === 400 || res.status === 401);
  return { access: body.access_token, refresh: body.refresh_token, expires: Date.now() + (body.expires_in ?? 7 * 86_400) * 1000 };
}

export class HardcoverError extends Error {
  /** True when the connection itself is gone and has to be made again. */
  signedOut: boolean;
  constructor(message: string, signedOut = false) {
    super(message);
    this.signedOut = signedOut;
  }
}

/**
 * Sends you to Hardcover to say yes, and waits on a port of this computer
 * for it to send you back. open shows the page; the address is given back
 * too, for when no browser opens. Gives up after ten minutes, or when cancelled.
 */
export function connect(open: (url: string) => void, cancelled?: AbortSignal): Promise<Tokens> {
  const id = clientId();
  if (!id) return Promise.reject(new HardcoverError(t("Connecting to Hardcover isn't set up in this copy of Shelfed.")));
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return new Promise((done, fail) => {
    let server: Server | null = null;
    const finish = (error: Error | null, tokens?: Tokens) => {
      clearTimeout(timer);
      server?.close();
      server = null;
      if (error) fail(error);
      else done(tokens!);
    };
    const timer = setTimeout(() => finish(new HardcoverError(t("Hardcover didn't answer in time. Try connecting again."))), 10 * 60_000);
    cancelled?.addEventListener("abort", () => finish(new HardcoverError("Cancelled")));
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const redirect = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/callback`;
      const q = url.searchParams;
      const answer = (ok: boolean) => {
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(ok ? PAGE("Connected to Hardcover", "You can close this tab and go back to Shelfed.") : PAGE("Not connected", "Shelfed didn't connect to Hardcover. Go back to Shelfed and try again."));
      };
      // The answer has to be to this request, and from Hardcover itself.
      if (q.get("state") !== state || q.get("iss") !== ISSUER()) {
        answer(false);
        return finish(new HardcoverError(t("That answer wasn't from Hardcover. Try connecting again.")));
      }
      if (!q.get("code")) {
        answer(false);
        return finish(new HardcoverError(q.get("error") === "access_denied" ? t("Hardcover wasn't allowed. Nothing was connected.") : (q.get("error_description") ?? t("Hardcover said no."))));
      }
      try {
        const tokens = await tokenRequest({ grant_type: "authorization_code", code: q.get("code")!, redirect_uri: redirect, code_verifier: verifier, client_id: id });
        answer(true);
        finish(null, tokens);
      } catch (error) {
        answer(false);
        finish(error as Error);
      }
    });
    server.on("error", (error) => finish(error));
    server.listen(0, "127.0.0.1", () => {
      const redirect = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/callback`;
      const params = new URLSearchParams({
        response_type: "code",
        client_id: id,
        redirect_uri: redirect,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope: SCOPES,
      });
      open(`${AUTHORIZE()}?${params}`);
    });
  });
}

/** New keys for old. The old refresh key stops working, so the new ones have to be kept straight away. */
export const refresh = (tokens: Tokens) => tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh, client_id: clientId() });

/** Tells Hardcover to forget this connection, so it stops showing in your connected apps. */
export async function revoke(tokens: Tokens) {
  await fetch(`${API()}/oauth2/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: tokens.refresh, token_type_hint: "refresh_token", client_id: clientId() }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/* ------------------------------------------------------------------------ */
/* Asking                                                                    */
/* ------------------------------------------------------------------------ */

export type Ask = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Asks Hardcover's API as you, a request at a time. Keys are renewed when
 * they're close to running out, or when Hardcover says they have, and saved
 * at once. When Hardcover asks to slow down, it waits as long as it says.
 */
export function asker(keys: { get: () => Tokens | null; set: (tokens: Tokens) => void }, version: string): Ask {
  let renewing: Promise<Tokens> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const renew = () =>
    (renewing ??= (async () => {
      const now = keys.get();
      if (!now) throw new HardcoverError(t("Not connected to Hardcover."), true);
      const fresh = await refresh(now);
      keys.set(fresh);
      return fresh;
    })().finally(() => (renewing = null)));

  const once = async <T>(query: string, variables: Record<string, unknown> | undefined, tries = 0): Promise<T> => {
    let tokens = keys.get();
    if (!tokens) throw new HardcoverError(t("Not connected to Hardcover."), true);
    if (tokens.expires - Date.now() < 3_600_000) tokens = await renew();
    const res = await fetch(`${API()}/v1/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.access}`, "User-Agent": `Shelfed/${version} (+https://shelfed.simonveprek.cz)` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 && tries === 0) {
      await renew();
      return once(query, variables, 1);
    }
    if ((res.status === 429 || res.status === 503) && tries < 2) {
      const after = res.headers.get("retry-after");
      await wait(Math.min(60, after !== null && Number.isFinite(Number(after)) ? Number(after) : 5) * 1000);
      return once(query, variables, tries + 1);
    }
    const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message?: string }>; error?: string; error_description?: string };
    if (res.status === 401) throw new HardcoverError(t("Hardcover has forgotten this connection. Connect again to carry on."), true);
    if (!res.ok || body.errors?.length || !body.data) throw new HardcoverError(body.errors?.[0]?.message ?? body.error_description ?? body.error ?? `HTTP ${res.status}`);
    // Hardcover lets a burst through, then a request a second; a pause between keeps well inside it.
    await wait(Number(process.env.SHELF_HARDCOVER_GAP ?? 250));
    return body.data;
  };
  return <T>(query: string, variables?: Record<string, unknown>) => {
    const next = queue.then(() => once<T>(query, variables));
    queue = next.catch(() => undefined);
    return next;
  };
}

export const ME = `query Me { me { id username } }`;

/** Your library at Hardcover, a page at a time, with what's needed to match each book to one here. */
export const LIBRARY = `query Library($userId: Int!, $limit: Int!, $offset: Int!) {
  user_books(where: { user_id: { _eq: $userId } }, order_by: { id: asc }, limit: $limit, offset: $offset) {
    id
    book_id
    status_id
    rating
    edition { isbn_10 isbn_13 pages }
    book { title pages cached_contributors }
    user_book_reads(where: { finished_at: { _is_null: true } }, order_by: { id: desc }, limit: 1) { id progress_pages }
  }
}`;

export const BY_ISBN = `query ByIsbn($isbn: String!) {
  editions(where: { _or: [{ isbn_13: { _eq: $isbn } }, { isbn_10: { _eq: $isbn } }] }, limit: 1) { id book_id pages }
}`;

export const SEARCH = `query Find($q: String!) { search(query: $q, query_type: "Book", per_page: 5) { results } }`;

export const ADD = `mutation Add($object: UserBookCreateInput!) { insert_user_book(object: $object) { id error } }`;

export const CHANGE = `mutation Change($id: Int!, $object: UserBookUpdateInput!) { update_user_book(id: $id, object: $object) { id error } }`;

export const PROGRESS = `mutation Progress($id: Int!, $read: DatesReadInput!) { update_user_book_read(id: $id, object: $read) { id error } }`;

/** Who you are at Hardcover. */
export async function whoAmI(ask: Ask) {
  const { me } = await ask<{ me: Array<{ id: number; username: string }> | { id: number; username: string } }>(ME);
  const user = Array.isArray(me) ? me[0] : me;
  if (!user) throw new HardcoverError(t("Hardcover didn't say who you are."), true);
  return { id: user.id, username: user.username };
}

/* ------------------------------------------------------------------------ */
/* Keeping in step                                                           */
/* ------------------------------------------------------------------------ */

/** A book in your library at Hardcover. */
export type Remote = {
  id: number;
  book_id: number;
  status_id: number;
  rating: number | null;
  edition?: { isbn_10?: string | null; isbn_13?: string | null; pages?: number | null } | null;
  book?: { title?: string; pages?: number | null; cached_contributors?: unknown } | null;
  user_book_reads?: Array<{ id: number; progress_pages?: number | null }>;
};

/** Hardcover's statuses: want to read, reading, read, paused, didn't finish, ignored. */
const TO_REMOTE: Record<ReadStatus, number> = { unread: 1, reading: 2, finished: 3 };
const FROM_REMOTE: Record<number, ReadStatus | undefined> = { 1: "unread", 2: "reading", 3: "finished", 4: "reading" };
const RANK: Record<ReadStatus, number> = { unread: 0, reading: 1, finished: 2 };

/** A rating as Hardcover keeps it: half stars from half to five, or none. */
const remoteRating = (stars: number) => (stars > 0 ? Math.min(5, Math.max(0.5, Math.round(stars * 2) / 2)) : null);
/** And as Shelfed shows it, in whole stars. */
const localRating = (rating: number | null) => (rating ? Math.min(5, Math.max(1, Math.round(rating))) : 0);

const fold = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[:(].*$/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^(the|a|an) /, "")
    .replace(/\s+/g, " ")
    .trim();

const surname = (name: string) => fold(name).split(" ").pop() ?? "";

/** The names Hardcover keeps beside a book, in whichever shape it gives them. */
function authorsOf(remote: Remote): string[] {
  const list = remote.book?.cached_contributors;
  if (!Array.isArray(list)) return [];
  return list.flatMap((c) => {
    const entry = c as { name?: string; author?: { name?: string } };
    const name = entry?.author?.name ?? entry?.name;
    return typeof name === "string" ? [name] : [];
  });
}

const isbnOf = (text?: string | null) => (text ? text.replace(/[^0-9xX]/g, "").toUpperCase() : "");

/** The same book here and there: by the link made before, by ISBN, or by title and an author's surname. */
export function sameBook(book: Book, remote: Remote) {
  if (book.hardcover) return book.hardcover.book === remote.book_id;
  const isbn = isbnOf(book.isbn);
  if (isbn && (isbn === isbnOf(remote.edition?.isbn_13) || isbn === isbnOf(remote.edition?.isbn_10))) return true;
  if (!remote.book?.title || fold(remote.book.title) !== fold(book.title)) return false;
  const theirs = authorsOf(remote).map(surname);
  return !theirs.length || !book.authors.length || book.authors.some((a) => theirs.includes(surname(a)));
}

export type Library = {
  books: () => Book[];
  update: (id: string, patch: Partial<Book>) => Promise<unknown> | unknown;
};

export type Outcome = { linked: number; pulled: number; pushed: number; added: number; notFound: string[] };

/** Finds a book at Hardcover to add it to your library there: by its ISBN, or by title and author. */
async function findAt(ask: Ask, book: Book): Promise<{ book: number; edition?: number; pages?: number } | null> {
  const isbn = isbnOf(book.isbn);
  if (isbn.length === 10 || isbn.length === 13) {
    const { editions } = await ask<{ editions: Array<{ id: number; book_id: number; pages?: number | null }> }>(BY_ISBN, { isbn });
    if (editions[0]) return { book: editions[0].book_id, edition: editions[0].id, pages: editions[0].pages ?? undefined };
  }
  const { search } = await ask<{ search: { results?: unknown } }>(SEARCH, { q: [book.title, book.authors[0]].filter(Boolean).join(" ") });
  const results = (typeof search?.results === "string" ? JSON.parse(search.results) : search?.results) as { hits?: Array<{ document?: { id?: number | string; title?: string; author_names?: string[]; pages?: number } }> } | undefined;
  for (const hit of results?.hits ?? []) {
    const doc = hit.document;
    if (!doc?.id || !doc.title || fold(doc.title) !== fold(book.title)) continue;
    const theirs = (doc.author_names ?? []).map(surname);
    if (theirs.length && book.authors.length && !book.authors.some((a) => theirs.includes(surname(a)))) continue;
    return { book: Number(doc.id), pages: doc.pages };
  }
  return null;
}

/**
 * Brings Shelfed and Hardcover into step, for the books both have. What
 * changed on one side since last time goes to the other; when both changed,
 * Shelfed's wins, since that's where you are. The first time a book is
 * matched, whichever is further on wins, and a rating on either side is kept.
 * Books marked here since connecting that Hardcover doesn't have yet are
 * added there; books only Hardcover has are left there.
 */
export async function syncHardcover(ask: Ask, library: Library, userId: number, pending: Set<string>): Promise<Outcome> {
  const outcome: Outcome = { linked: 0, pulled: 0, pushed: 0, added: 0, notFound: [] };
  const remotes: Remote[] = [];
  for (let offset = 0; ; offset += 100) {
    const { user_books } = await ask<{ user_books: Remote[] }>(LIBRARY, { userId, limit: 100, offset });
    remotes.push(...user_books);
    if (user_books.length < 100) break;
  }
  const taken = new Set<number>();
  // Looked up by what a book could be matched on, so a big library on both sides is still quick.
  const byBook = new Map(remotes.map((r) => [r.book_id, r]));
  const byIsbn = new Map<string, Remote>();
  const byTitle = new Map<string, Remote[]>();
  for (const r of remotes) {
    for (const isbn of [isbnOf(r.edition?.isbn_13), isbnOf(r.edition?.isbn_10)]) if (isbn) byIsbn.set(isbn, r);
    const title = fold(r.book?.title ?? "");
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), r]);
  }
  const match = (book: Book) => {
    const free = (r?: Remote) => (r && !taken.has(r.id) ? r : undefined);
    if (book.hardcover) return free(byBook.get(book.hardcover.book));
    const isbn = isbnOf(book.isbn);
    return free(isbn ? byIsbn.get(isbn) : undefined) ?? (byTitle.get(fold(book.title)) ?? []).find((r) => !taken.has(r.id) && sameBook(book, r));
  };

  for (const book of library.books()) {
    const remote = match(book);
    const before = book.hardcover;

    if (!remote) {
      // Gone from Hardcover since: the link is let go, and the book is left as it is here.
      if (before) await library.update(book.id, { hardcover: undefined });
      // Marked here since connecting, so it goes there.
      if (!pending.has(book.id) || book.status === "unread") continue;
      const found = await findAt(ask, book);
      if (!found) {
        outcome.notFound.push(book.title);
        continue;
      }
      const rating = remoteRating(book.rating);
      const object = { book_id: found.book, status_id: TO_REMOTE[book.status], ...(found.edition ? { edition_id: found.edition } : {}), ...(rating ? { rating } : {}) };
      const { insert_user_book } = await ask<{ insert_user_book: { id: number | null; error?: string | null } }>(ADD, { object });
      if (!insert_user_book?.id) throw new HardcoverError(insert_user_book?.error ?? t("Hardcover didn't add it."));
      outcome.added++;
      await library.update(book.id, {
        hardcover: { id: insert_user_book.id, book: found.book, status: object.status_id, rating, local: { status: book.status, rating: book.rating }, pages: found.pages },
      });
      continue;
    }
    taken.add(remote.id);
    outcome.linked++;

    let status = book.status;
    let stars = book.rating;
    let push: { status_id?: number; rating?: number | null } = {};
    const theirs = FROM_REMOTE[remote.status_id];

    if (!before) {
      // Matched for the first time: whichever is further on, and any rating at all.
      if (theirs && RANK[theirs] > RANK[status]) status = theirs;
      // Paused, didn't finish or ignored there are left as they are.
      else if (theirs && RANK[status] > RANK[theirs]) push.status_id = TO_REMOTE[status];
      if (!stars && remote.rating) stars = localRating(remote.rating);
      else if (stars && !remote.rating) push.rating = remoteRating(stars);
    } else {
      const changedHere = book.status !== before.local.status || book.rating !== before.local.rating;
      const changedThere = remote.status_id !== before.status || (remote.rating ?? null) !== (before.rating ?? null);
      if (changedHere) {
        if (book.status !== before.local.status) push.status_id = TO_REMOTE[book.status];
        if (book.rating !== before.local.rating) push.rating = remoteRating(book.rating);
      } else if (changedThere) {
        if (remote.status_id !== before.status && theirs) status = theirs;
        if ((remote.rating ?? null) !== (before.rating ?? null)) stars = localRating(remote.rating);
      }
    }
    // Nothing to send that Hardcover has already.
    if (push.status_id === remote.status_id) delete push.status_id;
    if ("rating" in push && (push.rating ?? null) === (remote.rating ?? null)) delete push.rating;

    if (Object.keys(push).length) {
      const { update_user_book } = await ask<{ update_user_book: { id: number | null; error?: string | null } }>(CHANGE, { id: remote.id, object: push });
      if (update_user_book?.error) throw new HardcoverError(update_user_book.error);
      outcome.pushed++;
    }

    // How far in: pages read of the edition, while it's being read.
    const pages = remote.edition?.pages ?? remote.book?.pages ?? before?.pages ?? undefined;
    const read = remote.user_book_reads?.[0];
    let sentProgress = before?.progress;
    if (status === "reading" && read && pages && book.progress !== undefined && Math.abs((book.progress ?? 0) - (before?.progress ?? -1)) >= 0.01) {
      const at = Math.max(0, Math.min(pages - 1, Math.round(book.progress * pages)));
      if (at !== read.progress_pages) {
        const { update_user_book_read } = await ask<{ update_user_book_read: { error?: string | null } }>(PROGRESS, { id: read.id, read: { progress_pages: at } });
        if (update_user_book_read?.error) throw new HardcoverError(update_user_book_read.error);
      }
      sentProgress = book.progress;
    }

    const changedLocally = status !== book.status || stars !== book.rating;
    if (changedLocally) outcome.pulled++;
    const remoteStatus = push.status_id ?? remote.status_id;
    const remoteStars = "rating" in push ? (push.rating ?? null) : (remote.rating ?? null);
    const link = { id: remote.id, book: remote.book_id, status: remoteStatus, rating: remoteStars, local: { status, rating: stars }, pages: pages ?? undefined, progress: sentProgress };
    // A book only changes here when something about it did, so nothing else about it moves.
    if (!changedLocally && JSON.stringify(link) === JSON.stringify(before)) continue;
    await library.update(book.id, {
      ...(status !== book.status ? { status, ...(status === "finished" && !book.finishedAt ? { finishedAt: Date.now() } : {}) } : {}),
      ...(stars !== book.rating ? { rating: stars } : {}),
      hardcover: link,
    });
  }
  return outcome;
}
