import { strToU8, zipSync, type Zippable } from "fflate";
import { blocksOf, type Run } from "./blocks";
import { extOf, type Content } from "./epub";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** English Metric Units, Word's measure: 914400 to the inch. */
const EMU = 914400;
/** The widest and tallest a picture may be on the page, in inches. */
const FIT = { width: 6, height: 8.5 };
/** Pictures Word shows. Others, like WebP, are left out. */
const SHOWS = ["image/jpeg", "image/png", "image/gif"];

/** A picture's size in pixels, read from its header. */
export function pictureSize(data: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (data[i] << 8) | data[i + 1];
  if (data[0] === 0x89 && data[1] === 0x50) return { width: (u16(16) << 16) | u16(18), height: (u16(20) << 16) | u16(22) };
  if (data[0] === 0x47 && data[1] === 0x49) return { width: data[6] | (data[7] << 8), height: data[8] | (data[9] << 8) };
  if (data[0] === 0xff && data[1] === 0xd8) {
    // Through the JPEG's markers to the frame header that holds the size.
    for (let i = 2; i + 9 < data.length; ) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

function run(r: Run) {
  if (r.br) return "<w:r><w:br/></w:r>";
  const props = [r.bold && "<w:b/>", r.italic && "<w:i/>", r.sup && '<w:vertAlign w:val="superscript"/>', r.sub && '<w:vertAlign w:val="subscript"/>'].filter(Boolean).join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
}

const para = (style: string, inner: string, extra = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${inner}</w:p>`;

/** A Word document, with the book's headings, emphasis and pictures, a chapter to a page. */
export function buildDocx(content: Content): Uint8Array {
  const files: Zippable = {};
  const rels: string[] = [];
  const body: string[] = [];
  // Each picture goes in once, however often the book shows it.
  const placed = new Map<{ data: Uint8Array; type: string }, string>();
  let pictures = 0;
  let drawings = 0;

  const picture = (image: { data: Uint8Array; type: string } | undefined) => {
    if (!image || !SHOWS.includes(image.type)) return "";
    const size = pictureSize(image.data) ?? { width: 600, height: 800 };
    // Pixels at 96 to the inch, shrunk to fit the page if they must.
    const scale = Math.min(1, FIT.width / (size.width / 96), FIT.height / (size.height / 96));
    const cx = Math.round((size.width / 96) * scale * EMU);
    const cy = Math.round((size.height / 96) * scale * EMU);
    let id = placed.get(image);
    if (!id) {
      id = `rImg${++pictures}`;
      const name = `image${pictures}.${extOf(image.type)}`;
      files[`word/media/${name}`] = [image.data, { level: 0 }];
      rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
      placed.set(image, id);
    }
    const n = ++drawings;
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="Picture ${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };

  // The front: the cover if there is one, then the title and who wrote it.
  if (content.cover) body.push(picture(content.cover));
  body.push(para("Title", run({ text: content.title }), content.cover ? '<w:pageBreakBefore/>' : ""));
  if (content.authors.length) body.push(para("Subtitle", run({ text: content.authors.join(", ") })));

  for (const chapter of content.chapters) {
    let first = true;
    for (const block of blocksOf(chapter.xhtml)) {
      // Each chapter starts on a new page.
      const brk = first ? "<w:pageBreakBefore/>" : "";
      if (block.kind === "image") {
        const xml = picture(content.images.get(block.src.replace(/^(\.\.\/)+/, "")));
        if (xml) body.push(brk ? xml.replace("<w:pPr>", `<w:pPr>${brk}`) : xml);
        else continue;
      } else if (block.kind === "rule") body.push(para("Normal", run({ text: "*  *  *" }), `${brk}<w:jc w:val="center"/>`));
      else if (block.kind === "heading") body.push(para(`Heading${block.level}`, block.runs.map(run).join(""), brk));
      else body.push(para({ paragraph: "Normal", quote: "Quote", item: "ListItem" }[block.kind], (block.kind === "item" ? run({ text: "•\t" }) : "") + block.runs.map(run).join(""), brk));
      first = false;
    }
  }

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  files["word/document.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  files["word/styles.xml"] = strToU8(STYLES(content.language || "en"));
  files["word/_rels/document.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join("")}</Relationships>`,
  );
  files["docProps/core.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(content.title)}</dc:title><dc:creator>${esc(content.authors.join(", "))}</dc:creator><dc:language>${esc(content.language || "en")}</dc:language></cp:coreProperties>`,
  );
  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  return zipSync(files, { level: 6 });
}

/** A quiet book look: a serif, generous lines, headings a little larger. */
const STYLES = (lang: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia" w:eastAsia="Georgia"/><w:sz w:val="23"/><w:lang w:val="${esc(lang)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="480" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="180"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="567" w:right="567"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListItem"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr></w:style>
</w:styles>`;
