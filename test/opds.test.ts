import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetch = vi.fn();
let settings: { catalogues?: Array<{ id: string; name: string; url: string }> } = {};
vi.mock("electron", () => ({ app: { getPath: () => tmpdir(), isPackaged: true }, net: { fetch } }));
vi.mock("../src/main/settings", () => ({
  getSettings: () => settings,
  setSettings: (patch: typeof settings) => (settings = { ...settings, ...patch }),
}));
const { kid, kids, parseXml, textOf, unescape } = await import("../src/main/xml");
const opds = await import("../src/main/opds");

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", "opds", name), "utf8");

/** A Calibre content server's newest books, as it writes them, with what else catalogues do mixed in. */
const CALIBRE = `<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE feed [<!ENTITY boom "&boom;&boom;&boom;"><!ENTITY file SYSTEM "file:///etc/passwd">]>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xml:base="http://192.168.1.10:8080/opds/">
  <atom:title>calibre Library</atom:title>
  <atom:link rel="search" type="application/atom+xml" href="search/{searchTerms}"/>
  <atom:link rel="next" type="application/atom+xml;profile=opds-catalog" href="new?offset=25"/>
  <atom:entry>
    <atom:title>Dune &amp; Other Sands</atom:title>
    <atom:author><atom:name>Frank Herbert</atom:name></atom:author>
    <atom:id>urn:uuid:1</atom:id>
    <dc:language>en</dc:language>
    <atom:content type="html">&lt;p&gt;A desert planet.&lt;/p&gt;&lt;p&gt;And &lt;b&gt;spice&lt;/b&gt;.&lt;/p&gt;</atom:content>
    <atom:link rel="http://opds-spec.org/acquisition" type="application/pdf" href="/get/pdf/1"/>
    <atom:link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/get/epub/1" length="1000"/>
    <atom:link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="/get/thumb/1"/>
    <atom:link rel="http://opds-spec.org/image" type="image/jpeg" href="/get/cover/1"/>
  </atom:entry>
  <atom:entry>
    <atom:title>Bought Elsewhere</atom:title>
    <atom:link rel="http://opds-spec.org/acquisition/buy" type="application/epub+zip" href="https://shop.example/buy/2"/>
    <atom:link rel="http://opds-spec.org/acquisition" type="application/vnd.adobe.adept+xml" href="https://shop.example/2.acsm"/>
  </atom:entry>
  <atom:entry>
    <atom:title><![CDATA[By Author <Herbert>]]></atom:title>
    <atom:link rel="subsection" type="application/atom+xml;profile=opds-catalog;kind=acquisition" href="author/7"/>
    <atom:content type="text">3 books</atom:content>
  </atom:entry>
  <atom:entry>
    <atom:title>Sneaky</atom:title>
    <atom:link rel="subsection" type="application/atom+xml" href="javascript:alert(1)"/>
    <atom:link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="file:///etc/passwd"/>
  </atom:entry>
</atom:feed>`;

beforeEach(() => {
  fetch.mockReset();
  settings = {};
});

describe("reading XML by hand", () => {
  it("reads elements, attributes and text, without their prefixes", () => {
    const feed = parseXml(CALIBRE)!;
    expect(feed.name).toBe("feed");
    expect(textOf(kid(feed, "title"))).toBe("calibre Library");
    expect(kids(feed, "entry")).toHaveLength(4);
    expect(feed.attrs["xml:base"]).toBe("http://192.168.1.10:8080/opds/");
  });

  it("never reads a DOCTYPE's entities, so they can't grow or reach files", () => {
    const feed = parseXml(`<!DOCTYPE x [<!ENTITY e "&e;&e;">]><x>&e; &amp; &#x17E;</x>`)!;
    expect(textOf(feed)).toBe("&e; & ž");
  });

  it("keeps text in the order it reads", () => {
    expect(textOf(parseXml("<p>Hello <b>world</b> again</p>")!)).toBe("Hello world again");
  });

  it("copes with what isn't quite XML", () => {
    expect(parseXml("")).toBeNull();
    expect(parseXml("just words")).toBeNull();
    expect(textOf(parseXml("<a><b>unclosed</a>")!)).toBe("unclosed");
    expect(parseXml('<a title="x > y">ok</a>')!.attrs.title).toBe("x > y");
    expect(unescape("&#0; &#xD800; &bogus;")).toBe("  &bogus;");
  });

  it("stops at a feed far deeper or bigger than any real one", () => {
    expect(() => parseXml("<a>".repeat(100))).toThrow("Too deep");
    expect(() => parseXml("<a/>".repeat(200_001))).toThrow("Too big");
  });
});

describe("reading a catalogue's page", () => {
  it("finds a Calibre server's books, its best file of each, and where to go next", () => {
    const page = opds.readAtom(CALIBRE, "http://192.168.1.10:8080/opds/new");
    expect(page.title).toBe("calibre Library");
    expect(page.books).toHaveLength(2);
    const [dune, bought] = page.books;
    expect(dune).toMatchObject({
      title: "Dune & Other Sands",
      authors: ["Frank Herbert"],
      summary: "A desert planet.\nAnd spice.",
      language: "en",
      cover: "http://192.168.1.10:8080/get/thumb/1",
      bigCover: "http://192.168.1.10:8080/get/cover/1",
      file: { url: "http://192.168.1.10:8080/get/epub/1", ext: "epub", size: 1000 },
    });
    // For sale or locked with Adobe's DRM: shown, but not offered.
    expect(bought).toMatchObject({ title: "Bought Elsewhere", locked: true });
    expect(bought.file).toBeUndefined();
    expect(page.places).toEqual([{ title: "By Author <Herbert>", url: "http://192.168.1.10:8080/opds/author/7", summary: "3 books" }]);
    expect(page.next).toBe("http://192.168.1.10:8080/opds/new?offset=25");
    expect(page.search).toBe("http://192.168.1.10:8080/opds/search/{searchTerms}");
  });

  it("never takes a link that isn't on the web", () => {
    const page = opds.readAtom(CALIBRE, "http://192.168.1.10:8080/opds/new");
    expect(JSON.stringify(page)).not.toMatch(/javascript:|file:/);
    expect(page.books.map((b) => b.title)).not.toContain("Sneaky");
  });

  it("reads Project Gutenberg's popular page, where every book is a page of its own", () => {
    const page = opds.readAtom(fixture("gutenberg-popular.xml"), "https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads");
    expect(page.books).toEqual([]);
    expect(page.places.map((p) => p.title)).toEqual(["Pride and Prejudice", "Frankenstein; or, The modern Prometheus", expect.any(String)]);
    expect(page.places[0]).toMatchObject({ url: "https://www.gutenberg.org/ebooks/1342.opds", summary: "Jane Austen" });
    expect(page.next).toBe("https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads&start_index=26");
    expect(page.search).toBe("https://www.gutenberg.org/catalog/osd-books.xml");
  });

  it("takes a Gutenberg book's fullest EPUB, with its cover", () => {
    const page = opds.readAtom(fixture("gutenberg-1342.xml"), "https://www.gutenberg.org/ebooks/1342.opds");
    // Gutenberg lists the book twice, with its pictures and without.
    const book = page.books.find((b) => !b.file?.url.includes("noimages"))!;
    expect(book).toMatchObject({ title: "Pride and Prejudice", authors: ["Austen, Jane"], file: { ext: "epub", url: expect.stringMatching(/1342\.epub3?\.images$/) } });
    expect(book.cover).toBe("https://www.gutenberg.org/cache/epub/1342/pg1342.cover.small.jpg");
    expect(book.summary).toContain("Elizabeth Bennet");
    expect(book.published).toBe("1998-06-01");
  });

  it("reads OPDS 2: its places, its groups and their books", () => {
    const page = opds.readJson(fixture("opds2-home.json"), "https://test.opds.io/2.0/home.json");
    expect(page.title).toBe("OPDS 2.0 Test Catalog");
    expect(page.places.map((p) => p.title)).toContain("Explore (Navigation Feed)");
    expect(page.places.map((p) => p.title)).toContain("French Classics");
    expect(page.books[0]).toMatchObject({ title: "Moby-Dick", authors: ["Herman Melville"], language: "en" });
    expect(page.books.find((b) => b.title === "Voyage au centre de la Terre")).toMatchObject({
      title: "Voyage au centre de la Terre",
      authors: ["Jules Verne"],
      language: "fr",
      file: { url: "https://test.opds.io/assets/centredelaterre/file.epub", ext: "epub" },
      cover: "https://test.opds.io/assets/centredelaterre/small.jpg",
      bigCover: "https://test.opds.io/assets/centredelaterre/normal.jpg",
    });
  });

  it("says plainly when it's not a catalogue", () => {
    expect(() => opds.readAtom("<!DOCTYPE html><html><body>Sign in</body></html>", "https://x.test/")).toThrow("isn't a catalogue");
    expect(() => opds.readJson("{ not json", "https://x.test/")).toThrow("isn't a catalogue");
    expect(() => opds.readJson('{"hello": 1}', "https://x.test/")).toThrow("isn't a catalogue");
  });
});

describe("search templates", () => {
  it("fills in OpenSearch's and OPDS 2's words, leaving out what's optional", () => {
    expect(opds.fillTemplate("https://x.test/s?q={searchTerms}&p={startPage?}", "war & peace")).toBe("https://x.test/s?q=war%20%26%20peace&p=");
    expect(opds.fillTemplate("https://x.test/search{?query}", "dune")).toBe("https://x.test/search?query=dune");
    expect(opds.fillTemplate("https://x.test/{query}/{other}", "a/b")).toBe("https://x.test/a%2Fb/");
  });

  it("makes a relative template absolute, keeping its parts", () => {
    expect(opds.absoluteTemplate("search/{searchTerms}", "http://h.test/opds/")).toBe("http://h.test/opds/search/{searchTerms}");
    expect(opds.absoluteTemplate("javascript:{x}", "http://h.test/")).toBeUndefined();
  });
});

/** Answers fetches from a table of address → [status, type, body]. */
function web(table: Record<string, [number, string, string | Uint8Array]>) {
  fetch.mockImplementation(async (url: string) => {
    const hit = table[url];
    if (!hit) return new Response("nope", { status: 404 });
    return new Response(hit[2] as BodyInit, { status: hit[0], headers: { "content-type": hit[1] } });
  });
}

describe("going only where a catalogue sends it", () => {
  it("adds a catalogue once it answers as one, named by itself", async () => {
    web({ "http://192.168.1.10:8080/opds": [200, "application/atom+xml", CALIBRE] });
    const added = await opds.addCatalogue("192.168.1.10:8080/opds");
    expect(added).toEqual([{ id: expect.any(String), name: "calibre Library", url: "http://192.168.1.10:8080/opds" }]);
    await expect(opds.addCatalogue("http://192.168.1.10:8080/opds")).rejects.toThrow("here already");
    expect(opds.removeCatalogue(added[0].id)).toEqual([]);
  });

  it("won't add what isn't one, and says why", async () => {
    web({ "https://standardebooks.org/feeds/opds": [401, "text/html", "<html/>"], "https://example.test/": [200, "text/html", "<!DOCTYPE html><html></html>"] });
    await expect(opds.addCatalogue("https://standardebooks.org/feeds/opds")).rejects.toThrow("wants a password");
    await expect(opds.addCatalogue("https://example.test/")).rejects.toThrow("isn't a catalogue");
    await expect(opds.addCatalogue("https://me:secret@example.test/opds")).rejects.toThrow("Leave the name and password out");
    await expect(opds.addCatalogue("ftp://example.test/")).rejects.toThrow("isn't a web address");
    expect(settings.catalogues ?? []).toEqual([]);
  });

  it("follows only the links a catalogue gave", async () => {
    // Another server than the other tests', so none of its links are known yet.
    const other = CALIBRE.replaceAll("192.168.1.10", "10.0.0.2");
    settings = { catalogues: [{ id: "c", name: "Calibre", url: "http://10.0.0.2:8080/opds/new" }] };
    web({ "http://10.0.0.2:8080/opds/new": [200, "application/atom+xml", other], "http://10.0.0.2:8080/opds/author/7": [200, "application/atom+xml", other] });
    await expect(opds.cataloguePage("http://10.0.0.2:8080/opds/author/7")).rejects.toThrow("only follows a catalogue's own links");
    await opds.cataloguePage("http://10.0.0.2:8080/opds/new");
    await expect(opds.cataloguePage("http://10.0.0.2:8080/opds/author/7")).resolves.toMatchObject({ title: "calibre Library" });
    await expect(opds.cataloguePage("http://169.254.169.254/latest/meta-data/")).rejects.toThrow("own links");
    await expect(opds.downloadFromCatalogue("http://10.0.0.2:8080/opds/new", "x", "epub")).rejects.toThrow("own links");
    expect((await opds.catalogueImage("https://elsewhere.test/tracker.png")).status).toBe(404);
  });

  it("searches with the catalogue's own template, or its OpenSearch description", async () => {
    settings = { catalogues: [{ id: "g", name: "Gutenberg", url: "https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads" }] };
    const osd = `<OpenSearchDescription><Url type="text/html" template="http://www.gutenberg.org/ebooks/search/?query={searchTerms}"/><Url type="application/atom+xml" template="http://m.gutenberg.org/ebooks/search.opds/?query={searchTerms}"/></OpenSearchDescription>`;
    web({
      "https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads": [200, "application/atom+xml", fixture("gutenberg-popular.xml")],
      "https://www.gutenberg.org/catalog/osd-books.xml": [200, "application/opensearchdescription+xml", osd],
      "http://m.gutenberg.org/ebooks/search.opds/?query=jane%20austen": [200, "application/atom+xml", fixture("gutenberg-popular.xml")],
    });
    const home = await opds.cataloguePage(settings.catalogues![0].url);
    await expect(opds.searchCatalogue(home.search!, "jane austen")).resolves.toMatchObject({ places: expect.any(Array) });
    await expect(opds.searchCatalogue("https://evil.test/{searchTerms}", "x")).rejects.toThrow("own links");
    await expect(opds.searchCatalogue(home.search!, "   ")).rejects.toThrow("Type something");
  });

  it("downloads a book it offered, as the kind of file it turns out to be", async () => {
    settings = { catalogues: [{ id: "c", name: "Calibre", url: "http://192.168.1.10:8080/opds/new" }] };
    web({
      "http://192.168.1.10:8080/opds/new": [200, "application/atom+xml", CALIBRE],
      "http://192.168.1.10:8080/get/epub/1": [200, "application/epub+zip", new Uint8Array([80, 75, 3, 4])],
    });
    await opds.cataloguePage("http://192.168.1.10:8080/opds/new");
    const path = await opds.downloadFromCatalogue("http://192.168.1.10:8080/get/epub/1", "Dune / Part: One", "epub");
    expect(path.startsWith(tmpdir())).toBe(true);
    expect(path).toMatch(/\.epub$/);
    expect(readFileSync(path)).toEqual(Buffer.from([80, 75, 3, 4]));
  });

  it("shows covers only as pictures, from where the catalogue said", async () => {
    settings = { catalogues: [{ id: "c", name: "Calibre", url: "http://192.168.1.10:8080/opds/new" }] };
    web({
      "http://192.168.1.10:8080/opds/new": [200, "application/atom+xml", CALIBRE],
      "http://192.168.1.10:8080/get/thumb/1": [200, "image/jpeg", new Uint8Array([255, 216, 255])],
      "http://192.168.1.10:8080/get/cover/1": [200, "image/svg+xml", "<svg onload='x'/>"],
    });
    await opds.cataloguePage("http://192.168.1.10:8080/opds/new");
    const thumb = await opds.catalogueImage("http://192.168.1.10:8080/get/thumb/1");
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/jpeg");
    expect((await opds.catalogueImage("http://192.168.1.10:8080/get/cover/1")).status).toBe(404);
  });

  it("won't read a feed far bigger than any catalogue's", async () => {
    settings = { catalogues: [{ id: "c", name: "Big", url: "https://big.test/opds" }] };
    fetch.mockImplementation(async () => new Response(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(1 << 20)) }), { status: 200, headers: { "content-type": "application/atom+xml" } }));
    await expect(opds.cataloguePage("https://big.test/opds")).rejects.toThrow("far bigger");
  });
});

describe("more of what catalogues do", () => {
  it("reads attributes in either quote, and passes over comments and instructions", () => {
    const feed = parseXml(`<?xml version='1.0'?><!-- hello --><feed><link rel='next' href="b?x='1'"/><?pi stuff?><title>T</title></feed>`)!;
    expect(kid(feed, "link")!.attrs).toMatchObject({ rel: "next", href: "b?x='1'" });
    expect(textOf(kid(feed, "title"))).toBe("T");
  });

  it("follows an entry's own xml:base, and links that start with //", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>
      <entry xml:base="https://cdn.example/books/"><title>Based</title><link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="based.epub"/></entry>
      <entry><title>Other host</title><link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="//files.example/x.epub"/></entry></feed>`;
    const page = opds.readAtom(xml, "https://home.example/opds");
    expect(page.books.map((b) => b.file?.url)).toEqual(["https://cdn.example/books/based.epub", "https://files.example/x.epub"]);
  });

  it("keeps a small picture written into the feed as it is, and never fetches it", async () => {
    const tiny = "data:image/png;base64,iVBORw0KGgo=";
    const xml = `<feed><title>T</title><entry><title>B</title><link rel="http://opds-spec.org/image/thumbnail" href="${tiny}"/><link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://x.example/b.epub"/></entry></feed>`;
    const page = opds.readAtom(xml, "https://x.example/opds");
    expect(page.books[0].cover).toBe(tiny);
    expect((await opds.catalogueImage(tiny)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never takes a book from an address written into the feed, nor an SVG as a picture", () => {
    const xml = `<feed><title>T</title><entry><title>B</title>
      <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="data:application/epub+zip;base64,AAAA"/>
      <link rel="http://opds-spec.org/image" href="data:image/svg+xml;base64,PHN2Zy8+"/></entry></feed>`;
    const page = opds.readAtom(xml, "https://x.example/opds");
    // With no file it can be had from, it isn't shown at all.
    expect(page.books).toEqual([]);
    expect(page.places).toEqual([]);
  });

  it("takes a file the kind its address says when the link doesn't, and kepub as EPUB", () => {
    const xml = `<feed><title>T</title>
      <entry><title>A</title><link rel="http://opds-spec.org/acquisition" type="application/octet-stream" href="/get/a.fb2"/></entry>
      <entry><title>K</title><link rel="http://opds-spec.org/acquisition" href="/get/k.kepub"/></entry>
      <entry><title>X</title><link rel="http://opds-spec.org/acquisition" href="/get/x.exe"/></entry></feed>`;
    const page = opds.readAtom(xml, "https://x.example/opds");
    expect(page.books.map((b) => [b.title, b.file?.ext, b.locked ?? false])).toEqual([["A", "fb2", false], ["K", "epub", false], ["X", undefined, true]]);
  });

  it("finds an OPDS 2 search template, and fills it in", async () => {
    settings = { catalogues: [{ id: "j", name: "J", url: "https://json.example/home.json" }] };
    const home = { metadata: { title: "J" }, links: [{ rel: "search", href: "/search{?query}", type: "application/opds+json", templated: true }], navigation: [] };
    const found = { metadata: { title: "Found" }, publications: [{ metadata: { title: "Dune" }, links: [{ rel: "http://opds-spec.org/acquisition/open-access", href: "/d.epub", type: "application/epub+zip" }] }] };
    web({ "https://json.example/home.json": [200, "application/opds+json", JSON.stringify(home)], "https://json.example/search?query=dune": [200, "application/opds+json", JSON.stringify(found)] });
    const page = await opds.cataloguePage("https://json.example/home.json");
    expect(page.search).toBe("https://json.example/search{?query}");
    expect((await opds.searchCatalogue(page.search!, "dune")).books[0].title).toBe("Dune");
  });

  it("says so when a book needs a password, or is far too big", async () => {
    settings = { catalogues: [{ id: "c", name: "C", url: "https://locked.example/opds" }] };
    const xml = `<feed><title>T</title>
      <entry><title>A</title><link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://locked.example/a.epub"/></entry>
      <entry><title>B</title><link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://locked.example/b.epub"/></entry></feed>`;
    fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/opds")) return new Response(xml, { status: 200, headers: { "content-type": "application/atom+xml" } });
      if (url.endsWith("a.epub")) return new Response("no", { status: 401 });
      return new Response("big", { status: 200, headers: { "content-type": "application/epub+zip", "content-length": String(500_000_000) } });
    });
    await opds.cataloguePage("https://locked.example/opds");
    await expect(opds.downloadFromCatalogue("https://locked.example/a.epub", "A", "epub")).rejects.toThrow("wants a password");
    await expect(opds.downloadFromCatalogue("https://locked.example/b.epub", "B", "epub")).rejects.toThrow("far bigger");
  });

  it("names a download by what the server says it is", async () => {
    settings = { catalogues: [{ id: "c", name: "C", url: "https://named.example/opds" }] };
    const xml = `<feed><title>T</title><entry><title>A</title><link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://named.example/get/1"/></entry></feed>`;
    fetch.mockImplementation(async (url: string) =>
      url.endsWith("/opds")
        ? new Response(xml, { status: 200, headers: { "content-type": "application/atom+xml" } })
        : new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="Anna.fb2"' } }),
    );
    await opds.cataloguePage("https://named.example/opds");
    expect(await opds.downloadFromCatalogue("https://named.example/get/1", "../../Anna Karenina", "epub")).toMatch(/[/\\]shelf-[^/\\]+[/\\][^/\\]*Anna Karenina\.fb2$/);
  });

  it("can't be reached is said plainly, with the host", async () => {
    settings = { catalogues: [{ id: "c", name: "C", url: "https://down.example/opds" }] };
    fetch.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
    await expect(opds.cataloguePage("https://down.example/opds")).rejects.toThrow("couldn't reach down.example");
  });
});
