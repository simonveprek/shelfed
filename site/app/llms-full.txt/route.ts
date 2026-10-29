import { GROUPS, MAKES, NAME, OPENS, QUESTIONS, REASONS, STORY, SUMMARY, TAGLINE } from "@/content";
import { RELEASES, REPO, SITE, VERSION, installer } from "@/lib";

export const dynamic = "force-static";

/** Everything the page says, as plain Markdown, for AI agents that want it all in one read. */
export function GET() {
  const text = `# ${NAME}

> ${SUMMARY}

${TAGLINE} Version ${VERSION}. Made by Šimon Vepřek (https://simonveprek.cz).

## What it does

${STORY.slice(1)
  .map((c) => `### ${c.title}\n\n${c.line}\n\n${(c.facts ?? []).map((f) => `- ${f}`).join("\n")}`)
  .join("\n\n")}

## Why it's safe to try

${REASONS.map(([title, text]) => `- **${title}** ${text}`).join("\n")}

## Everything in it

${GROUPS.map(([title, items]) => `### ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}`).join("\n\n")}

## Formats

- Opens: ${OPENS.join(", ")}
- Makes: ${MAKES.join(", ")}

## Download

- macOS, Apple silicon: ${installer("mac", "arm64")}
- macOS, Intel: ${installer("mac", "x64")}
- Windows (x64, runs on ARM PCs too): ${installer("win", "x64")}
- Every release: ${RELEASES}

## Questions

${QUESTIONS.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}

## Links

- Website: ${SITE}
- Source code: ${REPO}
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
