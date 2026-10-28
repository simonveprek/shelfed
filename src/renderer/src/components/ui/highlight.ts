/*
 * A small syntax highlighter for code on the page. No dependencies, runs
 * anywhere. It knows TypeScript and TSX, CSS, shell, JSON and markdown well
 * enough for docs, keeps state across lines for block comments and
 * template strings, and paints with the --code-* tokens in globals.css.
 */

export type Lang = "tsx" | "ts" | "js" | "css" | "bash" | "json" | "md" | "sql" | "text";

export type TokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "function"
  | "type"
  | "tag"
  | "attr"
  | "punct";

export type Token = { kind: TokenKind; text: string };

const KEYWORDS = new Set(
  (
    "import export from const let var function return if else for while do switch case break continue new await async " +
    "type interface extends implements as default class this super null undefined true false try catch finally throw " +
    "typeof keyof instanceof in of satisfies readonly void enum declare namespace yield static get set delete"
  ).split(" "),
);

const SQL_KEYWORDS = new Set(
  (
    "select from where insert into values update set delete create table alter add drop index on and or not null " +
    "primary key references default order by group limit returning join inner left as case when then else end for skip locked"
  ).split(" "),
);

/** Guesses the language from a file name or the first line of code. */
export function guessLang(code: string, file?: string): Lang {
  const ext = file?.split(".").pop()?.toLowerCase();
  if (ext) {
    if (["tsx", "jsx"].includes(ext)) return "tsx";
    if (["ts", "mts", "cts"].includes(ext)) return "ts";
    if (["js", "mjs", "cjs"].includes(ext)) return "js";
    if (ext === "css") return "css";
    if (["sh", "bash", "zsh"].includes(ext) || file?.endsWith(".env.example")) return "bash";
    if (ext === "json") return "json";
    if (["md", "mdx"].includes(ext)) return "md";
    if (ext === "sql") return "sql";
    if (["yml", "yaml", "toml"].includes(ext)) return "bash";
  }
  const first = code.trimStart();
  if (/^(npx|pnpm|npm|yarn|bun|git|curl|cd|export|brew)\b/.test(first)) return "bash";
  if (/^[{[]/.test(first) && /^\s*[{[]\s*"/.test(first)) return "json";
  return "tsx";
}

type State = { block: boolean; template: boolean };

/** Splits code into lines of tokens. */
export function highlight(code: string, lang: Lang): Token[][] {
  const state: State = { block: false, template: false };
  return code.split("\n").map((line) => tokenizeLine(line, lang, state));
}

function push(tokens: Token[], kind: TokenKind, text: string) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) last.text += text;
  else tokens.push({ kind, text });
}

function tokenizeLine(line: string, lang: Lang, state: State): Token[] {
  if (lang === "text") return [{ kind: "plain", text: line }];
  if (lang === "bash") return bashLine(line);
  if (lang === "json") return jsonLine(line);
  if (lang === "md") return mdLine(line);

  const tokens: Token[] = [];
  let i = 0;
  const css = lang === "css";
  const sql = lang === "sql";
  const jsLike = !css && !sql;
  let inTag = false;

  while (i < line.length) {
    const rest = line.slice(i);

    // Inside a block comment carried from an earlier line.
    if (state.block) {
      const end = rest.indexOf("*/");
      if (end === -1) {
        push(tokens, "comment", rest);
        break;
      }
      push(tokens, "comment", rest.slice(0, end + 2));
      i += end + 2;
      state.block = false;
      continue;
    }

    // Inside a template string carried from an earlier line.
    if (state.template) {
      const end = rest.search(/(?<!\\)`/);
      if (end === -1) {
        push(tokens, "string", rest);
        break;
      }
      push(tokens, "string", rest.slice(0, end + 1));
      i += end + 1;
      state.template = false;
      continue;
    }

    if (rest.startsWith("/*") || (jsLike && rest.startsWith("{/*"))) {
      state.block = true;
      continue;
    }
    if ((jsLike && /^\/\//.test(rest) && (i === 0 || /\s|[;,(){}]/.test(line[i - 1]))) || (sql && rest.startsWith("--"))) {
      push(tokens, "comment", rest);
      break;
    }

    const quote = rest[0];
    if (quote === '"' || quote === "'" || (jsLike && quote === "`")) {
      let j = 1;
      while (j < rest.length && rest[j] !== quote) j += rest[j] === "\\" ? 2 : 1;
      if (j >= rest.length && quote === "`") {
        push(tokens, "string", rest);
        state.template = true;
        break;
      }
      push(tokens, "string", rest.slice(0, j + 1));
      i += j + 1;
      continue;
    }

    // JSX tags, <Name and </name and the closing bracket.
    if (jsLike && lang !== "ts" && /^<\/?[A-Za-z]/.test(rest)) {
      const match = rest.match(/^(<\/?)([A-Za-z][\w.]*)/)!;
      push(tokens, "punct", match[1]);
      push(tokens, /^[A-Z]/.test(match[2]) ? "type" : "tag", match[2]);
      i += match[0].length;
      inTag = true;
      continue;
    }
    if (inTag && /^\/?>/.test(rest)) {
      const match = rest.match(/^\/?>/)!;
      push(tokens, "punct", match[0]);
      i += match[0].length;
      inTag = false;
      continue;
    }

    if (css) {
      const at = rest.match(/^@[\w-]+/);
      if (at) {
        push(tokens, "keyword", at[0]);
        i += at[0].length;
        continue;
      }
      const prop = rest.match(/^(--[\w-]+|[a-z-]+)(?=\s*:)/);
      if (prop && /^\s*$/.test(line.slice(0, i))) {
        push(tokens, "attr", prop[0]);
        i += prop[0].length;
        continue;
      }
      const fn = rest.match(/^[a-z-]+(?=\()/);
      if (fn) {
        push(tokens, "function", fn[0]);
        i += fn[0].length;
        continue;
      }
    }

    const number = rest.match(/^(#[0-9a-fA-F]{3,8}\b|\b\d[\d_]*(\.\d+)?(px|ms|s|em|rem|%|n)?\b)/);
    if (number && (i === 0 || !/[\w$]/.test(line[i - 1]))) {
      push(tokens, "number", number[0]);
      i += number[0].length;
      continue;
    }

    const word = rest.match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const text = word[0];
      const after = rest.slice(text.length);
      let kind: TokenKind = "plain";
      if (sql) kind = SQL_KEYWORDS.has(text.toLowerCase()) ? "keyword" : "plain";
      else if (inTag && /^\s*=/.test(after)) kind = "attr";
      else if (KEYWORDS.has(text)) kind = "keyword";
      else if (/^\s*\(/.test(after) || /^\s*=\s*(async\s*)?\(/.test(after)) kind = "function";
      else if (/^[A-Z]/.test(text)) kind = "type";
      push(tokens, kind, text);
      i += text.length;
      continue;
    }

    const ch = line[i];
    push(tokens, /[{}()[\];,.<>:=+\-*/!?&|]/.test(ch) ? "punct" : "plain", ch);
    i += 1;
  }
  return tokens;
}

function bashLine(line: string): Token[] {
  const tokens: Token[] = [];
  if (/^\s*#/.test(line)) return [{ kind: "comment", text: line }];
  const parts = line.match(/("[^"]*"?|'[^']*'?|\s+|[^\s"']+)/g) ?? [];
  let command = true;
  for (const part of parts) {
    if (/^\s+$/.test(part)) push(tokens, "plain", part);
    else if (/^["']/.test(part)) push(tokens, "string", part);
    else if (part.startsWith("#")) push(tokens, "comment", part);
    else if (/^(&&|\|\||\||;)$/.test(part)) {
      push(tokens, "punct", part);
      command = true;
      continue;
    } else if (/^--?[\w-]+/.test(part)) push(tokens, "keyword", part);
    else if (/^[A-Z_][A-Z0-9_]*=/.test(part)) {
      const [name, ...value] = part.split("=");
      push(tokens, "attr", name);
      push(tokens, "punct", "=");
      push(tokens, "string", value.join("="));
    } else if (command) push(tokens, "function", part);
    else push(tokens, "plain", part);
    command = false;
  }
  return tokens;
}

function jsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  const parts = line.match(/("(?:[^"\\]|\\.)*"(\s*:)?|-?\d+(\.\d+)?|true|false|null|\s+|.)/g) ?? [];
  for (const part of parts) {
    if (part.startsWith('"')) {
      if (/:\s*$/.test(part)) {
        const key = part.replace(/\s*:$/, "");
        push(tokens, "attr", key);
        push(tokens, "punct", part.slice(key.length));
      } else push(tokens, "string", part);
    } else if (/^-?\d/.test(part)) push(tokens, "number", part);
    else if (/^(true|false|null)$/.test(part)) push(tokens, "keyword", part);
    else push(tokens, /\s/.test(part) ? "plain" : "punct", part);
  }
  return tokens;
}

function mdLine(line: string): Token[] {
  if (/^#{1,6}\s/.test(line)) return [{ kind: "keyword", text: line }];
  if (/^```/.test(line)) return [{ kind: "comment", text: line }];
  const tokens: Token[] = [];
  for (const part of line.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/)) {
    if (part.startsWith("`")) push(tokens, "string", part);
    else if (part.startsWith("**")) push(tokens, "type", part);
    else if (part.startsWith("[")) push(tokens, "function", part);
    else push(tokens, "plain", part);
  }
  return tokens;
}

/** The colour class for each kind, reading the --code-* tokens. */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  comment: "text-[var(--code-comment)] italic",
  keyword: "text-[var(--code-keyword)]",
  string: "text-[var(--code-string)]",
  number: "text-[var(--code-number)]",
  function: "text-[var(--code-function)]",
  type: "text-[var(--code-type)]",
  tag: "text-[var(--code-tag)]",
  attr: "text-[var(--code-attr)]",
  punct: "text-[var(--code-punct)]",
};
