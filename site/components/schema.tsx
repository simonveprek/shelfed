import { GROUPS, NAME, QUESTIONS, SUMMARY, TAGLINE } from "@/content";
import { RELEASES, REPO, SITE, VERSION } from "@/lib";

/**
 * What the page is about, in the shape search engines and AI agents read
 * without guessing: the app, the site and the questions with their answers.
 */
export function Schema() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: NAME,
      alternateName: TAGLINE,
      description: SUMMARY,
      url: SITE,
      applicationCategory: "UtilitiesApplication",
      applicationSubCategory: "Ebook library manager",
      operatingSystem: "macOS, Windows",
      softwareVersion: VERSION,
      downloadUrl: RELEASES,
      installUrl: `${SITE}/#download`,
      license: "https://opensource.org/licenses/MIT",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: GROUPS.flatMap(([, items]) => items),
      screenshot: ["views", "bookcase", "reader", "kindle-plug"].map((clip) => `${SITE}/media/${clip}.jpg`),
      image: `${SITE}/media/social.jpg`,
      author: { "@type": "Person", name: "Šimon Vepřek", url: "https://simonveprek.cz" },
      sameAs: [REPO],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: NAME,
      codeRepository: REPO,
      programmingLanguage: ["TypeScript", "Go"],
      license: "https://opensource.org/licenses/MIT",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: QUESTIONS.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
    { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: SITE, description: SUMMARY },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
