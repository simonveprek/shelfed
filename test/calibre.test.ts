// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readCalibreOpf } from "../src/renderer/src/lib/calibre";

/** A metadata.opf as Calibre writes one beside every book. */
const OPF = `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier opf:scheme="calibre" id="calibre_id">412</dc:identifier>
    <dc:identifier opf:scheme="uuid" id="uuid_id">0c1f6f3e-6a7b-4d3a-9d1b-2f4f0b8f9e11</dc:identifier>
    <dc:title>The Ruins of Gorlan</dc:title>
    <dc:creator opf:file-as="Flanagan, John" opf:role="aut">John Flanagan</dc:creator>
    <dc:creator opf:role="ill">Someone Else</dc:creator>
    <dc:contributor opf:file-as="calibre" opf:role="bkp">calibre (7.4.0) [https://calibre-ebook.com]</dc:contributor>
    <dc:date>2005-11-01T00:00:00+00:00</dc:date>
    <dc:description>&lt;p&gt;They have always scared him in the past.&lt;/p&gt;</dc:description>
    <dc:publisher>Random House Australia</dc:publisher>
    <dc:identifier opf:scheme="ISBN">978-1-74166-019-8</dc:identifier>
    <dc:language>eng</dc:language>
    <dc:subject>Fantasy</dc:subject>
    <dc:subject>Young Adult</dc:subject>
    <meta name="calibre:series" content="Ranger's Apprentice"/>
    <meta name="calibre:series_index" content="1.0"/>
    <meta name="calibre:rating" content="8.0"/>
    <meta name="calibre:timestamp" content="2021-03-04T10:00:00+00:00"/>
    <meta name="calibre:title_sort" content="Ruins of Gorlan, The"/>
  </metadata>
  <guide><reference type="cover" title="Cover" href="cover.jpg"/></guide>
</package>`;

describe("Calibre's metadata.opf", () => {
  it("reads the details as they were set in Calibre", () => {
    expect(readCalibreOpf(OPF)).toEqual({
      title: "The Ruins of Gorlan",
      authors: ["John Flanagan"],
      series: "Ranger's Apprentice",
      seriesIndex: 1,
      tags: ["Fantasy", "Young Adult"],
      rating: 4,
      description: "They have always scared him in the past.",
      publisher: "Random House Australia",
      published: "2005-11-01",
      language: "eng",
      isbn: "9781741660198",
    });
  });

  it("leaves out what Calibre writes when it doesn't know", () => {
    const empty = OPF.replace("2005-11-01T00:00:00+00:00", "0101-01-01T00:00:00+00:00")
      .replace(/<dc:creator opf:file-as="Flanagan, John" opf:role="aut">John Flanagan<\/dc:creator>/, '<dc:creator opf:role="aut">Unknown</dc:creator>')
      .replace(/<meta name="calibre:(series|series_index|rating)"[^>]*\/>/g, "")
      .replace("<dc:language>eng</dc:language>", "<dc:language>und</dc:language>");
    const out = readCalibreOpf(empty);
    expect(out.published).toBeUndefined();
    expect(out.authors).toBeUndefined();
    expect(out.series).toBeUndefined();
    expect(out.rating).toBeUndefined();
    expect(out.language).toBeUndefined();
  });

  it("takes several authors, and a creator with no role as one", () => {
    const two = OPF.replace('<dc:creator opf:role="ill">Someone Else</dc:creator>', "<dc:creator>Terry Pratchett</dc:creator>");
    expect(readCalibreOpf(two).authors).toEqual(["John Flanagan", "Terry Pratchett"]);
  });

  it("gives nothing for something that isn't an OPF", () => {
    expect(readCalibreOpf("not xml at all")).toEqual({});
  });
});
