// @vitest-environment happy-dom
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildEpub, buildText, type Content } from "../src/renderer/src/lib/epub";

const content: Content = {
  title: "A Test & a Book",
  authors: ["Ada Writer"],
  language: "en",
  chapters: [
    { title: "One", xhtml: '<h1>One</h1><p>First <img src="images/pic.png" alt=""/></p>', toc: true },
    { title: "Two", xhtml: "<h1>Two</h1><p>Second</p>", toc: true },
  ],
  images: new Map([["images/pic.png", { data: new Uint8Array([137, 80, 78, 71]), type: "image/png" }]]),
  css: "p { margin: 0 }",
};

describe("making an EPUB", () => {
  const zip = buildEpub(content);
  const files = unzipSync(zip);

  it("starts with an uncompressed mimetype, as readers require", () => {
    expect(strFromU8(zip.subarray(30, 38))).toBe("mimetype");
    expect(strFromU8(files.mimetype)).toBe("application/epub+zip");
  });

  it("points the container at a package that lists every chapter", () => {
    expect(strFromU8(files["META-INF/container.xml"])).toMatch(/full-path="OEBPS\/content\.opf"/);
    const opf = strFromU8(files["OEBPS/content.opf"]);
    expect(opf).toContain("A Test &amp; a Book");
    expect(opf).toContain("Ada Writer");
    expect(opf.match(/<itemref /g)).toHaveLength(2);
  });

  it("keeps pictures and fixes their paths from inside the text folder", () => {
    expect(files["OEBPS/images/pic.png"]).toBeDefined();
    expect(strFromU8(files["OEBPS/text/ch001.xhtml"])).toContain('src="../images/pic.png"');
  });
});

describe("making plain text", () => {
  it("keeps the words and drops the markup", () => {
    const text = buildText(content);
    expect(text).toContain("First");
    expect(text).toContain("Second");
    expect(text).not.toMatch(/<p>|<img/);
  });
});
