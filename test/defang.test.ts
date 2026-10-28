import { describe, expect, it } from "vitest";
import { defang } from "../src/renderer/src/lib/defang";

describe("defang, the second lock on a book's pages", () => {
  it("removes scripts, inline and self-closing", () => {
    expect(defang('<p>a</p><script>alert(1)</script><p>b</p>')).toBe("<p>a</p><p>b</p>");
    expect(defang('<script src="x.js"/>ok')).toBe("ok");
    expect(defang("<SCRIPT type='text/javascript'>\nevil()\n</SCRIPT >ok")).toBe("ok");
  });

  it("removes inline event handlers", () => {
    const out = defang('<img src="a.png" onerror="steal()"><a href="#" onClick=\'x()\'>t</a>');
    expect(out).not.toMatch(/onerror|onclick/i);
    expect(out).toContain('src="a.png"');
  });

  it("removes frames, objects and embeds, with or without content", () => {
    const out = defang('<iframe src="https://x"></iframe><object data="x"><p>in</p></object><embed src="y"><frame src="z"/>ok');
    expect(out).not.toMatch(/iframe|object|embed|frame/i);
    expect(out).toContain("ok");
  });

  it("neuters javascript: links", () => {
    expect(defang('<a href="javascript:steal()">x</a>')).toBe('<a href="#">x</a>');
    expect(defang("<form action='javascript:go()'></form>")).toBe('<form action="#"></form>');
  });

  it("drops meta refreshes and base tags", () => {
    expect(defang('<meta http-equiv="refresh" content="0;url=https://x"><base href="https://evil/">ok')).toBe("ok");
  });

  it("leaves an ordinary page alone", () => {
    const page = '<html><head><link rel="stylesheet" href="s.css"/></head><body><h1 class="t">Chapter One</h1><p>It was <em>a dark</em> night.</p><img src="images/a.jpg" alt=""/></body></html>';
    expect(defang(page)).toBe(page);
  });
});
