import { blocksOf, type Run } from "./blocks";
import type { Content } from "./epub";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Pictures FB2 readers show. */
const SHOWS = ["image/jpeg", "image/png"];

function run(r: Run) {
  if (r.br) return "</p><p>";
  let text = esc(r.text);
  if (r.sup) text = `<sup>${text}</sup>`;
  if (r.sub) text = `<sub>${text}</sub>`;
  if (r.italic) text = `<emphasis>${text}</emphasis>`;
  if (r.bold) text = `<strong>${text}</strong>`;
  return text;
}

const line = (runs: Run[]) => `<p>${runs.map(run).join("")}</p>`.replace(/<p><\/p>/g, "<empty-line/>");

/** An author as FictionBook wants them: first names, then the last. */
function person(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.pop() ?? "";
  return `<author>${parts.length ? `<first-name>${esc(parts.join(" "))}</first-name>` : ""}<last-name>${esc(last)}</last-name></author>`;
}

function base64(data: Uint8Array) {
  let s = "";
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A FictionBook 2: the book's text in sections, pictures carried inside. */
export function buildFb2(content: Content): Uint8Array {
  const binaries = new Map<string, { id: string; type: string; data: Uint8Array }>();
  const binary = (key: string, image: { data: Uint8Array; type: string } | undefined) => {
    if (!image || !SHOWS.includes(image.type)) return null;
    let entry = binaries.get(key);
    if (!entry) {
      entry = { id: `img${binaries.size + 1}.${image.type === "image/png" ? "png" : "jpg"}`, type: image.type, data: image.data };
      binaries.set(key, entry);
    }
    return entry.id;
  };

  const cover = binary("cover", content.cover);
  const sections = content.chapters.map((chapter) => {
    const parts: string[] = [];
    let titled = false;
    for (const block of blocksOf(chapter.xhtml)) {
      if (block.kind === "image") {
        const id = binary(block.src, content.images.get(block.src.replace(/^(\.\.\/)+/, "")));
        if (id) parts.push(`<image l:href="#${id}"/>`);
      } else if (block.kind === "rule") parts.push("<empty-line/>");
      // The chapter's first heading is its title; later ones are subtitles.
      else if (block.kind === "heading" && !titled && !parts.length) {
        parts.push(`<title>${line(block.runs)}</title>`);
        titled = true;
      } else if (block.kind === "heading") parts.push(`<subtitle>${block.runs.map((r) => (r.br ? " " : run(r))).join("")}</subtitle>`);
      else if (block.kind === "quote") parts.push(`<cite>${line(block.runs)}</cite>`);
      else parts.push(line(block.kind === "item" ? [{ text: "• " }, ...block.runs] : block.runs));
    }
    if (!titled && chapter.toc) parts.unshift(`<title><p>${esc(chapter.title)}</p></title>`);
    // A section has to hold something after its title.
    if (!parts.some((p) => !p.startsWith("<title>"))) parts.push("<empty-line/>");
    return `<section>${parts.join("\n")}</section>`;
  });

  const lang = (content.language || "en").split("-")[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>prose</genre>
${(content.authors.length ? content.authors : ["Unknown"]).map(person).join("")}
<book-title>${esc(content.title)}</book-title>
${content.description ? `<annotation><p>${esc(content.description)}</p></annotation>` : ""}
${content.published ? `<date>${esc(content.published)}</date>` : ""}
${cover ? `<coverpage><image l:href="#${cover}"/></coverpage>` : ""}
<lang>${esc(lang)}</lang>
</title-info>
<document-info>
<author><nickname>Shelf</nickname></author>
<program-used>Shelf</program-used>
<date value="${new Date().toISOString().slice(0, 10)}">${new Date().toISOString().slice(0, 10)}</date>
<id>${crypto.randomUUID()}</id>
<version>1.0</version>
</document-info>
${content.publisher || content.isbn ? `<publish-info>${content.publisher ? `<publisher>${esc(content.publisher)}</publisher>` : ""}${content.isbn ? `<isbn>${esc(content.isbn)}</isbn>` : ""}</publish-info>` : ""}
</description>
<body>
<title><p>${esc(content.title)}</p></title>
${sections.join("\n")}
</body>
${[...binaries.values()].map((b) => `<binary id="${b.id}" content-type="${b.type}">${base64(b.data)}</binary>`).join("\n")}
</FictionBook>
`;
  return new TextEncoder().encode(xml);
}
