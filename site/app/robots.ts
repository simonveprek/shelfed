import type { MetadataRoute } from "next";
import { SITE } from "@/lib";

export const dynamic = "force-static";

/** Everyone may read it, AI crawlers by name, so none has to guess. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      {
        userAgent: [
          "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
          "Google-Extended", "Applebot-Extended", "Meta-ExternalAgent", "CCBot", "DuckAssistBot", "MistralAI-User",
        ],
        allow: "/",
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
