import type { MetadataRoute } from "next";
import { SITE } from "@/lib";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE}/llms.txt`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/llms-full.txt`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
