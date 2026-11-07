/*
 * Just enough XML to read a catalogue's feed: elements, their attributes and
 * their text. Prefixes are dropped, so <atom:entry> is an entry like any
 * other. A DOCTYPE and its entities are never read, so a feed can't make it
 * fetch files or grow without end; only XML's own five entities and numbered
 * characters are. A feed far bigger or deeper than any real one stops it.
 */

/** An element, or a run of text as a child named "#text". text is all the element's own text, without its children's. */
export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const MOST_NODES = 200_000;
const DEEPEST = 64;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** XML's entities as the characters they stand for; anything else is left as written. */
export function unescape(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] !== "#") return NAMED[code] ?? all;
    const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : "";
  });
}

const local = (name: string) => name.slice(name.indexOf(":") + 1).toLowerCase();

function attributes(source: string) {
  const attrs: Record<string, string> = Object.create(null);
  for (const m of source.matchAll(/([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const name = m[1].toLowerCase();
    // xml:base and xmlns stay whole; anything else loses its prefix.
    attrs[name.startsWith("xml:") || name.startsWith("xmlns") ? name : local(name)] = unescape(m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** The document's root element, or null when there's no XML in it. */
export function parseXml(xml: string): XmlNode | null {
  const root: XmlNode = { name: "#document", attrs: Object.create(null), children: [], text: "" };
  const stack = [root];
  let nodes = 0;
  let at = 0;
  const say = (node: XmlNode, text: string) => {
    if (!text) return;
    node.text += text;
    node.children.push({ name: "#text", attrs: Object.create(null), children: [], text });
  };
  while (at < xml.length) {
    const open = xml.indexOf("<", at);
    const top = stack[stack.length - 1];
    if (open < 0) {
      say(top, unescape(xml.slice(at)));
      break;
    }
    if (open > at) say(top, unescape(xml.slice(at, open)));
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      at = end < 0 ? xml.length : end + 3;
    } else if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      say(top, xml.slice(open + 9, end < 0 ? xml.length : end));
      at = end < 0 ? xml.length : end + 3;
    } else if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      at = end < 0 ? xml.length : end + 2;
    } else if (xml.startsWith("<!", open)) {
      // A DOCTYPE, with any internal subset in brackets, is passed over unread.
      let depth = 0;
      let i = open + 2;
      for (; i < xml.length; i++) {
        if (xml[i] === "[") depth++;
        else if (xml[i] === "]") depth--;
        else if (xml[i] === ">" && depth <= 0) break;
      }
      at = i + 1;
    } else if (xml[open + 1] === "/") {
      const end = xml.indexOf(">", open);
      const name = local(xml.slice(open + 2, end < 0 ? xml.length : end).trim());
      // Closes the nearest open element of that name, and any left open inside it.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      at = end < 0 ? xml.length : end + 1;
    } else {
      // A tag ends at the first > outside quotes.
      let i = open + 1;
      let quote = "";
      for (; i < xml.length; i++) {
        const c = xml[i];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      const inside = xml.slice(open + 1, i);
      const selfClosing = inside.endsWith("/");
      const name = inside.match(/^[^\s/>]+/)?.[0];
      at = i + 1;
      if (!name) continue;
      if (++nodes > MOST_NODES) throw new Error("Too big a feed");
      const node: XmlNode = { name: local(name), attrs: attributes(inside.slice(name.length)), children: [], text: "" };
      top.children.push(node);
      if (!selfClosing) {
        if (stack.length > DEEPEST) throw new Error("Too deep a feed");
        stack.push(node);
      }
    }
  }
  return root.children.find((c) => c.name !== "#text") ?? null;
}

/** The children of a node with a name. */
export const kids = (node: XmlNode | undefined, name: string) => node?.children.filter((c) => c.name === name) ?? [];

/** The first child of a node with a name. */
export const kid = (node: XmlNode | undefined, name: string) => node?.children.find((c) => c.name === name);

/** All the text in a node and the nodes inside it, in the order it reads. */
export function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  if (node.name === "#text") return node.text;
  return node.children.map(textOf).join("");
}
