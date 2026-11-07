/*
 * Makes small PDFs by hand for the tests, with exactly the things a real
 * book's PDF has: running headers, page numbers, headings, words broken over
 * lines, two columns, bold and italic, footnote marks, a picture and
 * bookmarks. Only the standard fonts every PDF reader has, so nothing is
 * embedded.
 */

export type MadeLine = {
  text: string;
  /** From the left edge and the top of the page, in points, to the baseline. */
  x: number;
  y: number;
  size?: number;
  font?: "regular" | "bold" | "italic" | "serif";
};

export type MadePage = { lines: MadeLine[]; picture?: { x: number; y: number; width: number; height: number } };

export type MadePdf = {
  pages: MadePage[];
  /** Bookmarks, to a page counted from 1. */
  marks?: Array<{ title: string; page: number }>;
  title?: string;
  author?: string;
  width?: number;
  height?: number;
};

const FONTS = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", serif: "Times-Roman" } as const;
const KEYS = { regular: "F1", bold: "F2", italic: "F3", serif: "F4" } as const;

/** The standard fonts' encoding, for the few characters outside Latin-1 a book uses. */
const WIN_ANSI: Record<string, number> = { "•": 0x95, "–": 0x96, "—": 0x97, "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92, "…": 0x85 };
const pdfString = (text: string) =>
  `(${[...text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")].map((c) => (WIN_ANSI[c] ? String.fromCharCode(WIN_ANSI[c]) : c)).join("")})`;

export function makePdf({ pages, marks = [], title, author, width = 420, height = 595 }: MadePdf): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1;
  const reserve = () => objects.push("") - 1 + 1;
  const set = (n: number, body: string) => (objects[n - 1] = body);

  const catalog = reserve();
  const pagesRoot = reserve();
  const fonts = Object.fromEntries(Object.entries(FONTS).map(([key, name]) => [key, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`)])) as Record<keyof typeof FONTS, number>;
  const fontDict = `<< ${Object.entries(KEYS).map(([key, ref]) => `/${ref} ${fonts[key as keyof typeof FONTS]} 0 R`).join(" ")} >>`;
  // A 2 by 2 picture, warm colours, stretched to wherever it's put.
  const image = add(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 12 >>\nstream\n${String.fromCharCode(200, 80, 40, 240, 200, 60, 60, 120, 200, 30, 160, 90)}\nendstream`);

  const pageRefs: number[] = [];
  for (const page of pages) {
    const ops: string[] = [];
    if (page.picture) {
      const { x, y, width: w, height: h } = page.picture;
      ops.push(`q ${w} 0 0 ${h} ${x} ${height - y - h} cm /Im1 Do Q`);
    }
    for (const line of page.lines) {
      const size = line.size ?? 11;
      ops.push(`BT /${KEYS[line.font ?? "regular"]} ${size} Tf 1 0 0 1 ${line.x} ${height - line.y} Tm ${pdfString(line.text)} Tj ET`);
    }
    const stream = ops.join("\n");
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageRefs.push(add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${contents} 0 R /Resources << /Font ${fontDict} /XObject << /Im1 ${image} 0 R >> >> >>`));
  }
  set(pagesRoot, `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);

  let outlines = "";
  if (marks.length) {
    const root = reserve();
    const items = marks.map(() => reserve());
    marks.forEach((mark, i) => {
      const links = [i > 0 ? `/Prev ${items[i - 1]} 0 R` : "", i < marks.length - 1 ? `/Next ${items[i + 1]} 0 R` : ""].join(" ");
      set(items[i], `<< /Title ${pdfString(mark.title)} /Parent ${root} 0 R ${links} /Dest [${pageRefs[mark.page - 1]} 0 R /Fit] >>`);
    });
    set(root, `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items[items.length - 1]} 0 R /Count ${marks.length} >>`);
    outlines = ` /Outlines ${root} 0 R /PageMode /UseOutlines`;
  }
  set(catalog, `<< /Type /Catalog /Pages ${pagesRoot} 0 R${outlines} >>`);
  const info = add(`<< ${title ? `/Title ${pdfString(title)}` : ""} ${author ? `/Author ${pdfString(author)}` : ""} >>`);

  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 255);
}

/** Words written out over lines the way a typesetter would, breaking long words with a hyphen. */
export function typeset(text: string, { x = 40, y, size = 11, width = 340, leading = 15, font, indent = 0 }: { x?: number; y: number; size?: number; width?: number; leading?: number; font?: MadeLine["font"]; indent?: number }) {
  const perLine = Math.floor(width / (size * 0.5));
  const lines: MadeLine[] = [];
  let line = "";
  const push = () => {
    lines.push({ text: line, x: lines.length ? x : x + indent, y: y + lines.length * leading, size, font });
    line = "";
  };
  for (const word of text.split(" ")) {
    const room = perLine - (line ? line.length + 1 : 0);
    if (word.length <= room) line = line ? `${line} ${word}` : word;
    else if (room > 4 && word.length > 6) {
      // Broken with a hyphen, the rest on the next line.
      const cut = room - 1;
      line = line ? `${line} ${word.slice(0, cut)}-` : `${word.slice(0, cut)}-`;
      push();
      line = word.slice(cut);
    } else {
      push();
      line = word;
    }
  }
  if (line) push();
  return lines;
}

export const SAMPLE = {
  title: "The Salt Road",
  author: "Ada Marsh",
  one: "The road ran down to the sea, and every morning the carts went down it loaded with nothing and came back up white with salt. Nobody in the village could remember a time before the road, and nobody thought to ask who had first cut it into the hillside.",
  two: "Her grandmother kept the accounts in a book bound in blue cloth, and in the margins she drew the weather: suns, clouds, and once, in the winter of the great storm, a whole page of rain.",
  left: "On the left side of the page the tide tables ran in neat figures, high water and low, the hours marked in red ink where the moon was full.",
  right: "On the right side the names of the boats were written out, each with the number of barrels it had carried and what it was owed.",
  three: "The second chapter begins where the first one ended, at the bottom of the hill, where the road turns and runs along the shore toward the harbour.",
  four: "By the end of the summer the carts had worn two deep ruts into the road, and the children of the village raced paper boats down them whenever it rained.",
  five: "At the harbour the salt was weighed again, loaded onto the boats, and taken away to towns none of them would ever see.",
};

/** A small book as a PDF: a title page, two chapters with bookmarks, running heads and page numbers on every page. */
export function sampleBook({ marks = true }: { marks?: boolean } = {}) {
  const head = (n: number) => [
    { text: "THE SALT ROAD", x: 150, y: 30, size: 8 },
    { text: String(n), x: 205, y: 575, size: 9 },
  ];
  const pages: MadePage[] = [
    { lines: [{ text: SAMPLE.title, x: 90, y: 200, size: 26, font: "bold" }, { text: SAMPLE.author, x: 150, y: 240, size: 14 }] },
    {
      lines: [
        ...head(2),
        { text: "Chapter One", x: 40, y: 90, size: 20, font: "bold" },
        ...typeset(SAMPLE.one, { y: 130, indent: 0 }),
        ...typeset(SAMPLE.two, { y: 130 + 15 * 7, indent: 14 }),
        { text: "A note on salt", x: 40, y: 330, size: 11, font: "bold" },
        { text: "• Salt was weighed by the barrel.", x: 40, y: 355 },
        { text: "• Each barrel was marked in chalk.", x: 40, y: 370 },
        { text: "The accounts were kept in", x: 40, y: 400 },
        { text: "pencil", x: 180, y: 400, font: "italic" },
        { text: "and checked on Sundays.", x: 216, y: 400 },
        { text: "1", x: 340, y: 395, size: 6 },
      ],
    },
    {
      lines: [...head(3), ...typeset(SAMPLE.left, { y: 90, width: 150, x: 40 }), ...typeset(SAMPLE.right, { y: 90, width: 150, x: 230 })],
      picture: { x: 100, y: 300, width: 200, height: 150 },
    },
    { lines: [...head(4), ...typeset(SAMPLE.four, { y: 90, indent: 14 })] },
    { lines: [...head(5), { text: "Chapter Two", x: 40, y: 90, size: 20, font: "bold" }, ...typeset(SAMPLE.three, { y: 130 })] },
    { lines: [...head(6), ...typeset(SAMPLE.five, { y: 90, indent: 14 })] },
  ];
  return makePdf({ pages, title: SAMPLE.title, author: SAMPLE.author, marks: marks ? [{ title: "Chapter One", page: 2 }, { title: "Chapter Two", page: 5 }] : [] });
}
