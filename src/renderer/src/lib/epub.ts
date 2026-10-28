import { strToU8, zipSync, type Zippable } from "fflate";

/** One book's words and pictures, whatever file they came from. */
export type Content = {
  title: string;
  authors: string[];
  language: string;
  description?: string;
  publisher?: string;
  published?: string;
  isbn?: string;
  chapters: Chapter[];
  /** Pictures by their path inside the book, like images/img3.jpg. */
  images: Map<string, { data: Uint8Array; type: string }>;
  css: string;
  cover?: { data: Uint8Array; type: string };
};

export type Chapter = {
  title: string;
  /** The inside of the chapter's body, as well formed XHTML. */
  xhtml: string;
  /** Shown in the table of contents. */
  toc: boolean;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const extOf = (type: string) =>
  ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" })[type] ?? "jpg";

/** What a picture is, from its first bytes, since blobs often lose their type. */
export function sniff(data: Uint8Array, fallback = "image/jpeg") {
  if (data[0] === 0x89 && data[1] === 0x50) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data[0] === 0x47 && data[1] === 0x49) return "image/gif";
  if (data[8] === 0x57 && data[9] === 0x45) return "image/webp";
  if (data[0] === 0x3c) return "image/svg+xml";
  return fallback;
}

/** The typography every generated book gets, kept light so readers can restyle it. */
export const BASE_CSS = `
body { margin: 0 5%; line-height: 1.5; font-family: serif; }
h1, h2, h3 { line-height: 1.2; text-align: left; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.6em; margin: 1.6em 0 1em; }
h2 { font-size: 1.3em; margin: 1.4em 0 0.8em; }
p { margin: 0 0 0.2em; text-indent: 1.4em; }
h1 + p, h2 + p, h3 + p, hr + p { text-indent: 0; }
img { max-width: 100%; height: auto; }
blockquote { margin: 1em 1.5em; font-style: italic; }
pre, code { font-family: monospace; font-size: 0.9em; white-space: pre-wrap; }
hr { border: 0; text-align: center; margin: 1.4em 0; }
hr::after { content: "\\2042"; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-height: 100vh; }
`;

function page(title: string, body: string, lang: string, css = "style.css") {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="${css}"/></head>
<body>${body}</body>
</html>`;
}

/** A standard EPUB 3, with an EPUB 2 table of contents too for Kindle and older readers. */
export function buildEpub(content: Content): Uint8Array {
  const uid = `urn:uuid:${crypto.randomUUID()}`;
  const lang = content.language || "en";
  const files: Zippable = {};
  const manifest: string[] = [];
  const spine: string[] = [];
  const nav: string[] = [];
  const ncx: string[] = [];

  files["OEBPS/style.css"] = strToU8(`${BASE_CSS}\n${content.css}`);
  manifest.push('<item id="css" href="style.css" media-type="text/css"/>');

  if (content.cover) {
    const name = `images/cover.${extOf(content.cover.type)}`;
    files[`OEBPS/${name}`] = [content.cover.data, { level: 0 }];
    manifest.push(`<item id="cover-image" href="${name}" media-type="${content.cover.type}" properties="cover-image"/>`);
    files["OEBPS/cover.xhtml"] = strToU8(page(content.title, `<div class="cover"><img src="${name}" alt="${esc(content.title)}"/></div>`, lang));
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover"/>');
  }

  let i = 0;
  for (const [path, image] of content.images) {
    files[`OEBPS/${path}`] = [image.data, { level: 0 }];
    manifest.push(`<item id="img${++i}" href="${esc(path)}" media-type="${image.type}"/>`);
  }

  content.chapters.forEach((chapter, n) => {
    const name = `text/ch${String(n + 1).padStart(3, "0")}.xhtml`;
    // Chapters live one folder down, so their links to pictures climb up.
    const body = chapter.xhtml.replace(/(src|href|xlink:href)="images\//g, '$1="../images/');
    files[`OEBPS/${name}`] = strToU8(page(chapter.title, body, lang, "../style.css"));
    manifest.push(`<item id="ch${n + 1}" href="${name}" media-type="application/xhtml+xml"${/<svg/i.test(body) ? ' properties="svg"' : ""}/>`);
    spine.push(`<itemref idref="ch${n + 1}"/>`);
    if (chapter.toc || n === 0) {
      nav.push(`<li><a href="${name}">${esc(chapter.title)}</a></li>`);
      ncx.push(`<navPoint id="np${n + 1}" playOrder="${ncx.length + 1}"><navLabel><text>${esc(chapter.title)}</text></navLabel><content src="${name}"/></navPoint>`);
    }
  });

  files["OEBPS/nav.xhtml"] = strToU8(page("Contents", `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav.join("")}</ol></nav>`, lang));
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  files["OEBPS/toc.ncx"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/></head>
<docTitle><text>${esc(content.title)}</text></docTitle><navMap>${ncx.join("")}</navMap></ncx>`);
  manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');

  const meta = [
    `<dc:identifier id="uid">${uid}</dc:identifier>`,
    `<dc:title>${esc(content.title)}</dc:title>`,
    `<dc:language>${esc(lang)}</dc:language>`,
    ...content.authors.map((a, n) => `<dc:creator id="a${n}">${esc(a)}</dc:creator>`),
    content.description ? `<dc:description>${esc(content.description)}</dc:description>` : "",
    content.publisher ? `<dc:publisher>${esc(content.publisher)}</dc:publisher>` : "",
    content.published ? `<dc:date>${esc(content.published)}</dc:date>` : "",
    content.isbn ? `<dc:identifier>urn:isbn:${esc(content.isbn)}</dc:identifier>` : "",
    `<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>`,
    content.cover ? '<meta name="cover" content="cover-image"/>' : "",
  ].filter(Boolean);

  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${esc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${meta.join("\n")}</metadata>
<manifest>${manifest.join("\n")}</manifest>
<spine toc="ncx">${spine.join("\n")}</spine>
</package>`);

  files["META-INF/container.xml"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

  // The mimetype comes first and uncompressed, as the format asks.
  return zipSync({ mimetype: [strToU8("application/epub+zip"), { level: 0 }], ...files }, { level: 6 });
}

function dataUrl(image: { data: Uint8Array; type: string }) {
  let s = "";
  for (let i = 0; i < image.data.length; i += 0x8000) s += String.fromCharCode(...image.data.subarray(i, i + 0x8000));
  return `data:${image.type};base64,${btoa(s)}`;
}

/** One self contained HTML page, pictures inline, ready to print or save. */
export function buildHtml(content: Content, forPrint = false) {
  const inline = (xhtml: string) =>
    xhtml.replace(/(src|href|xlink:href)="(images\/[^"]+)"/g, (whole, attr, path) => {
      const image = content.images.get(path);
      return image ? `${attr}="${dataUrl(image)}"` : whole;
    });
  const front = content.cover
    ? `<section class="cover-page"><img src="${dataUrl(content.cover)}" alt=""/></section>`
    : `<section class="title-page"><h1>${esc(content.title)}</h1><p>${esc(content.authors.join(", "))}</p></section>`;
  const chapters = content.chapters.map((c) => `<section class="chapter">${inline(c.xhtml)}</section>`).join("\n");
  const look = forPrint
    ? `html { font-size: 11.5pt; }
body { margin: 0; font-family: "Iowan Old Style", Charter, Georgia, "Times New Roman", serif; color: #111; }
.chapter { break-before: page; }
.cover-page { break-after: page; height: 100vh; display: flex; align-items: center; justify-content: center; }
.cover-page img { max-height: 100%; max-width: 100%; }
.title-page { break-after: page; padding-top: 30vh; text-align: center; }
img { break-inside: avoid; }`
    : `body { max-width: 42em; margin: 3em auto; padding: 0 1.4em; font-family: "Iowan Old Style", Georgia, serif; font-size: 1.15rem; }
.cover-page img { display: block; max-width: 60%; margin: 0 auto 3em; }
.chapter { margin-bottom: 3em; }`;
  return `<!doctype html>
<html lang="${esc(content.language || "en")}"><head><meta charset="utf-8"/>
<title>${esc(content.title)}</title>
<style>${BASE_CSS}\n${content.css}\n${look}</style></head><body>
${front}
${chapters}
</body></html>`;
}

/** Plain text, paragraphs apart by an empty line. */
export function buildText(content: Content) {
  const parts = [content.title, content.authors.join(", "), ""];
  for (const chapter of content.chapters) {
    const doc = new DOMParser().parseFromString(`<div>${chapter.xhtml}</div>`, "text/html");
    const blocks: string[] = [];
    const walk = (el: Element) => {
      for (const child of el.children) {
        const text = () => (child.textContent ?? "").replace(/\s+/g, " ").trim();
        if (/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|FIGCAPTION|DT|DD|TR)$/.test(child.tagName)) {
          if (text()) blocks.push(/^H[1-3]$/.test(child.tagName) ? `\n${text().toUpperCase()}\n` : text());
        } else if (child.tagName === "HR") blocks.push("* * *");
        else if (child.children.length) walk(child);
        else if (text()) blocks.push(text());
      }
    };
    walk(doc.body.firstElementChild!);
    parts.push(blocks.join("\n\n"), "\n");
  }
  return `${parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim()}\n`;
}
