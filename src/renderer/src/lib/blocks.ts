/**
 * A chapter's XHTML as plain blocks of styled text, for the formats that
 * aren't HTML underneath: Word and FB2.
 */
export type Run = { text: string; bold?: boolean; italic?: boolean; sup?: boolean; sub?: boolean; br?: boolean };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; runs: Run[] }
  | { kind: "paragraph" | "quote" | "item"; runs: Run[] }
  | { kind: "rule" }
  /** A picture, by its path inside the book, like images/img3.jpg. */
  | { kind: "image"; src: string };

type Style = Omit<Run, "text" | "br">;

const BLOCK = /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|FIGCAPTION|DT|DD|TR|DIV|SECTION|ARTICLE|FIGURE|UL|OL|DL|TABLE|TBODY|THEAD|HEADER|FOOTER|ASIDE|NAV|HR|IMG|SVG)$/;

export function blocksOf(xhtml: string): Block[] {
  const doc = new DOMParser().parseFromString(`<div>${xhtml}</div>`, "text/html");
  const blocks: Block[] = [];

  /** Gathers the runs of one paragraph; a picture in the middle splits it. */
  const paragraph = (el: Element, make: (runs: Run[]) => Block) => {
    let runs: Run[] = [];
    const flush = () => {
      const tidy = trim(runs);
      if (tidy.length) blocks.push(make(tidy));
      runs = [];
    };
    const walk = (node: Node, style: Style) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? "").replace(/\s+/g, " ");
        if (text) runs.push({ text, ...style });
        return;
      }
      if (!(node instanceof Element)) return;
      const tag = node.tagName.toUpperCase();
      if (tag === "BR") return void runs.push({ text: "", br: true });
      if (tag === "IMG" || tag === "IMAGE") {
        const src = node.getAttribute("src") ?? node.getAttribute("xlink:href") ?? node.getAttribute("href");
        if (src) {
          flush();
          blocks.push({ kind: "image", src });
        }
        return;
      }
      const next = { ...style };
      if (tag === "B" || tag === "STRONG") next.bold = true;
      if (tag === "I" || tag === "EM" || tag === "CITE") next.italic = true;
      if (tag === "SUP") next.sup = true;
      if (tag === "SUB") next.sub = true;
      node.childNodes.forEach((child) => walk(child, next));
    };
    el.childNodes.forEach((child) => walk(child, {}));
    flush();
  };

  const visit = (el: Element, quoted: boolean) => {
    for (const child of el.children) {
      const tag = child.tagName.toUpperCase();
      const heading = tag.match(/^H([1-6])$/);
      if (heading) paragraph(child, (runs) => ({ kind: "heading", level: Math.min(3, Number(heading[1])) as 1 | 2 | 3, runs }));
      else if (tag === "HR") blocks.push({ kind: "rule" });
      else if (tag === "BLOCKQUOTE") visit(child, true);
      else if (tag === "LI") paragraph(child, (runs) => ({ kind: "item", runs }));
      else if (tag === "TR") paragraph(child, (runs) => ({ kind: quoted ? "quote" : "paragraph", runs }));
      else if (tag === "IMG" || tag === "SVG") {
        // A picture on its own, or one inside an svg, as some covers are.
        const image = tag === "IMG" ? child : child.querySelector("image");
        const src = image?.getAttribute("src") ?? image?.getAttribute("xlink:href") ?? image?.getAttribute("href");
        if (src) blocks.push({ kind: "image", src });
      }
      // A box holding other blocks is opened up; one holding only words is a paragraph.
      else if ([...child.children].some((c) => BLOCK.test(c.tagName.toUpperCase()) && c.tagName.toUpperCase() !== "IMG")) visit(child, quoted);
      else paragraph(child, (runs) => ({ kind: quoted ? "quote" : "paragraph", runs }));
    }
  };

  visit(doc.body.firstElementChild!, false);
  return blocks;
}

/** No spaces at a paragraph's edges, and none doubled where runs meet. */
function trim(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out.at(-1);
    let text = run.text;
    if ((!last || last.br || last.text.endsWith(" ")) && text.startsWith(" ")) text = text.slice(1);
    if (!text && !run.br) continue;
    out.push({ ...run, text });
  }
  while (out.length && !out.at(-1)!.br && out.at(-1)!.text.endsWith(" ")) {
    const last = out.at(-1)!;
    last.text = last.text.trimEnd();
    if (!last.text) out.pop();
  }
  while (out.length && out[0].br) out.shift();
  while (out.length && out.at(-1)!.br) out.pop();
  return out;
}
