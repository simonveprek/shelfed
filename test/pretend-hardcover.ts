import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/*
 * A pretend Hardcover: its sign-in page, which says yes at once and sends you
 * back, its token and revoke endpoints with keys that run out and refresh
 * keys that work once, and enough of its GraphQL API for keeping reading in
 * step, answered by operation name. Strict where the real one is: PKCE with
 * S256 always, the redirect has to match, and a spent refresh key ends the
 * whole connection.
 */

export type PretendEntry = {
  id: number;
  book_id: number;
  status_id: number;
  rating: number | null;
  edition?: { id?: number; isbn_10?: string | null; isbn_13?: string | null; pages?: number | null };
  book: { title: string; pages?: number | null; cached_contributors: Array<{ author: { name: string } }> };
  read?: { id: number; progress_pages: number | null };
};

export type PretendBook = { id: number; title: string; author: string; isbn13?: string; edition: number; pages?: number };

export type PretendHardcover = {
  url: string;
  library: PretendEntry[];
  catalogue: PretendBook[];
  /** Every GraphQL operation asked, by name, with its variables. */
  asked: Array<{ name: string; variables: Record<string, unknown> }>;
  /** What the sign-in page does: say yes, say no, or answer as someone else would. */
  consent: "yes" | "no" | "wrong-issuer";
  /** Makes the access key run out, as if a week had passed. */
  expire: () => void;
  /** How many times a refresh key was spent. */
  refreshed: number;
  revoked: string[];
  /** Answers the next GraphQL request with this status instead. */
  failNext: (status: number, headers?: Record<string, string>) => void;
  close: () => Promise<void>;
};

const read = (req: IncomingMessage) =>
  new Promise<string>((done) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => done(text));
  });

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function pretendHardcover(user = { id: 42, username: "reader" }): Promise<PretendHardcover> {
  const codes = new Map<string, { challenge: string; redirect: string; client: string }>();
  const access = new Map<string, number>();
  const refreshKeys = new Set<string>();
  const spent = new Set<string>();
  let failing: { status: number; headers?: Record<string, string> } | null = null;
  let nextEntry = 1000;
  let nextRead = 5000;

  const me: PretendHardcover = {
    url: "",
    library: [],
    catalogue: [],
    asked: [],
    consent: "yes",
    expire: () => {
      for (const key of access.keys()) access.set(key, 0);
    },
    refreshed: 0,
    revoked: [],
    failNext: (status, headers) => (failing = { status, headers }),
    close: () => new Promise((done) => server.close(() => done())),
  };

  const issue = () => {
    const a = `hc_at_${randomBytes(8).toString("hex")}`;
    const r = `hc_rt_${randomBytes(8).toString("hex")}`;
    access.set(a, Date.now() + 7 * 86_400_000);
    refreshKeys.add(r);
    return { access_token: a, refresh_token: r, expires_in: 7 * 86_400, token_type: "Bearer" };
  };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", me.url);
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/oauth2/authorize") {
      const q = url.searchParams;
      if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge") || q.get("response_type") !== "code") return json(400, { error: "invalid_request" });
      const back = new URL(q.get("redirect_uri")!);
      if (back.hostname !== "127.0.0.1" || back.pathname !== "/callback") return json(400, { error: "invalid_redirect_uri" });
      if (me.consent === "no") back.searchParams.set("error", "access_denied");
      else {
        const code = randomBytes(8).toString("hex");
        codes.set(code, { challenge: q.get("code_challenge")!, redirect: q.get("redirect_uri")!, client: q.get("client_id")! });
        back.searchParams.set("code", code);
      }
      back.searchParams.set("state", q.get("state") ?? "");
      back.searchParams.set("iss", me.consent === "wrong-issuer" ? "https://evil.example" : me.url);
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }

    if (url.pathname === "/oauth2/token" && req.method === "POST") {
      const form = new URLSearchParams(await read(req));
      if (form.get("grant_type") === "authorization_code") {
        const code = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? "");
        if (!code || code.redirect !== form.get("redirect_uri") || code.client !== form.get("client_id") || s256(form.get("code_verifier") ?? "") !== code.challenge)
          return json(400, { error: "invalid_grant", error_description: "That code isn't valid." });
        return json(200, issue());
      }
      if (form.get("grant_type") === "refresh_token") {
        const key = form.get("refresh_token") ?? "";
        if (spent.has(key)) {
          // Used twice: the whole chain goes.
          refreshKeys.clear();
          access.clear();
          return json(400, { error: "invalid_grant", error_description: "Refresh token reused." });
        }
        if (!refreshKeys.has(key)) return json(400, { error: "invalid_grant" });
        refreshKeys.delete(key);
        spent.add(key);
        me.refreshed++;
        return json(200, issue());
      }
      return json(400, { error: "unsupported_grant_type" });
    }

    if (url.pathname === "/oauth2/revoke" && req.method === "POST") {
      const form = new URLSearchParams(await read(req));
      me.revoked.push(form.get("token") ?? "");
      refreshKeys.clear();
      access.clear();
      return json(200, {});
    }

    if (url.pathname === "/v1/graphql" && req.method === "POST") {
      const key = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!key || (access.get(key) ?? 0) < Date.now()) return json(401, { error: "invalid_token" });
      if (failing) {
        const { status, headers } = failing;
        failing = null;
        return json(status, { error: "Too Many Requests" }, headers);
      }
      const { query, variables = {} } = JSON.parse(await read(req)) as { query: string; variables?: Record<string, any> };
      const name = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
      me.asked.push({ name, variables });
      const entryOut = (e: PretendEntry) => ({
        id: e.id,
        book_id: e.book_id,
        status_id: e.status_id,
        rating: e.rating,
        edition: e.edition ? { isbn_10: e.edition.isbn_10 ?? null, isbn_13: e.edition.isbn_13 ?? null, pages: e.edition.pages ?? null } : null,
        book: e.book,
        user_book_reads: e.read && e.status_id === 2 ? [e.read] : [],
      });
      switch (name) {
        case "Me":
          return json(200, { data: { me: [user] } });
        case "Library": {
          if (variables.userId !== user.id) return json(200, { data: { user_books: [] } });
          const page = me.library.slice(variables.offset, variables.offset + variables.limit);
          return json(200, { data: { user_books: page.map(entryOut) } });
        }
        case "ByIsbn": {
          const book = me.catalogue.find((b) => b.isbn13 === variables.isbn);
          return json(200, { data: { editions: book ? [{ id: book.edition, book_id: book.id, pages: book.pages ?? null }] : [] } });
        }
        case "Find": {
          const words = String(variables.q).toLowerCase();
          const hits = me.catalogue.filter((b) => words.includes(b.title.toLowerCase())).map((b) => ({ document: { id: String(b.id), title: b.title, author_names: [b.author], pages: b.pages } }));
          return json(200, { data: { search: { results: { found: hits.length, hits } } } });
        }
        case "Add": {
          const o = variables.object;
          const book = me.catalogue.find((b) => b.id === o.book_id)!;
          if (me.library.some((e) => e.book_id === o.book_id)) return json(200, { data: { insert_user_book: { id: null, error: "Already in your library" } } });
          const entry: PretendEntry = {
            id: nextEntry++,
            book_id: o.book_id,
            status_id: o.status_id ?? 1,
            rating: o.rating ?? null,
            edition: { id: o.edition_id, isbn_13: book.isbn13, pages: book.pages },
            book: { title: book.title, pages: book.pages, cached_contributors: [{ author: { name: book.author } }] },
            read: o.status_id === 2 ? { id: nextRead++, progress_pages: 0 } : undefined,
          };
          me.library.push(entry);
          return json(200, { data: { insert_user_book: { id: entry.id, error: null } } });
        }
        case "Change": {
          const entry = me.library.find((e) => e.id === variables.id);
          if (!entry) return json(200, { data: { update_user_book: { id: null, error: "Not found" } } });
          if (variables.object.rating !== undefined) {
            const r = variables.object.rating;
            if (r !== null && (r < 0.5 || r > 5 || !Number.isInteger(r * 2))) return json(200, { errors: [{ message: "rating out of range" }] });
            entry.rating = r;
          }
          if (variables.object.status_id !== undefined) {
            entry.status_id = variables.object.status_id;
            if (entry.status_id === 2 && !entry.read) entry.read = { id: nextRead++, progress_pages: 0 };
          }
          return json(200, { data: { update_user_book: { id: entry.id, error: null } } });
        }
        case "Progress": {
          const entry = me.library.find((e) => e.read?.id === variables.id);
          if (!entry) return json(200, { data: { update_user_book_read: { id: null, error: "Not found" } } });
          entry.read!.progress_pages = variables.read.progress_pages;
          return json(200, { data: { update_user_book_read: { id: variables.id, error: null } } });
        }
      }
      return json(200, { errors: [{ message: `Unknown operation ${name}` }] });
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  me.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return me;
}

/** An entry in the pretend library, for a test to start from. */
export function entry(id: number, title: string, author: string, status: number, extra: Partial<PretendEntry> = {}): PretendEntry {
  return { id, book_id: id + 100, status_id: status, rating: null, book: { title, pages: 300, cached_contributors: [{ author: { name: author } }] }, edition: { pages: 300 }, ...extra };
}
