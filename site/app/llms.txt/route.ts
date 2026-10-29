import { NAME, SUMMARY, TAGLINE } from "@/content";
import { RELEASES, REPO, SITE, VERSION } from "@/lib";

export const dynamic = "force-static";

/** The short version for AI agents, following llmstxt.org: what it is and where to look. */
export function GET() {
  const text = `# ${NAME}

> ${SUMMARY}

${TAGLINE} Version ${VERSION}. Free, open source under the MIT licence, for macOS (Apple silicon and Intel) and Windows (x64 and ARM).

## Get it

- [Download the latest release](${RELEASES}): installers for macOS and Windows
- [Website](${SITE}): what it does, with recordings of the app
- [Source code](${REPO}): TypeScript and Electron, MIT licensed

## More

- [Everything in full](${SITE}/llms-full.txt): every feature, the formats it handles, and answers to common questions
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
