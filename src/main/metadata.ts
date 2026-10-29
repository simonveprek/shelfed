import { net } from "electron";
import type { MetadataCandidate } from "../shared/types";

const get = async (url: string) => {
  const res = await net.fetch(url, { headers: { "User-Agent": "Shelfed/1.0 (book library app)" } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
};

type Query = { title: string; author?: string; isbn?: string };

export async function searchOpenLibrary(q: Query): Promise<MetadataCandidate[]> {
  const params = new URLSearchParams({
    limit: "6",
    fields: "key,title,author_name,first_publish_year,publisher,isbn,language,subject,cover_i",
  });
  if (q.isbn) params.set("isbn", q.isbn);
  else {
    params.set("title", q.title);
    if (q.author) params.set("author", q.author);
  }
  const data = await get(`https://openlibrary.org/search.json?${params}`);
  const docs = (data.docs ?? []) as Array<Record<string, any>>;
  // Open Library keeps descriptions on the work, so fetch them for the best few.
  return Promise.all(
    docs.slice(0, 5).map(async (doc) => {
      let description: string | undefined;
      try {
        const work = await get(`https://openlibrary.org${doc.key}.json`);
        description = typeof work.description === "string" ? work.description : work.description?.value;
      } catch {
        // A missing description is fine.
      }
      return {
        source: "openlibrary" as const,
        url: `https://openlibrary.org${doc.key}`,
        title: doc.title,
        authors: doc.author_name ?? [],
        description: description?.replace(/\r\n/g, "\n").split(/\n-{3,}|\n\(\[source\]/)[0].trim(),
        publisher: doc.publisher?.[0],
        published: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        language: doc.language?.[0],
        isbn: doc.isbn?.find((i: string) => i.length === 13) ?? doc.isbn?.[0],
        tags: (doc.subject ?? []).slice(0, 6),
        cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
      };
    }),
  );
}

export async function searchGoogle(q: Query): Promise<MetadataCandidate[]> {
  const terms = q.isbn
    ? `isbn:${q.isbn}`
    : [`intitle:${q.title}`, q.author ? `inauthor:${q.author}` : ""].filter(Boolean).join("+");
  const data = await get(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(terms)}&maxResults=5&printType=books`);
  return ((data.items ?? []) as Array<Record<string, any>>).map((item) => {
    const v = item.volumeInfo ?? {};
    const thumb: string | undefined = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail;
    return {
      source: "google" as const,
      url: v.infoLink ?? `https://books.google.com/books?id=${item.id}`,
      title: [v.title, v.subtitle].filter(Boolean).join(": "),
      authors: v.authors ?? [],
      description: v.description?.replace(/<[^>]+>/g, ""),
      publisher: v.publisher,
      published: v.publishedDate,
      language: v.language,
      isbn: (v.industryIdentifiers ?? []).find((i: any) => i.type === "ISBN_13")?.identifier,
      tags: (v.categories ?? []).slice(0, 6),
      // The larger rendition Google keeps behind the thumbnail.
      cover: thumb?.replace("http://", "https://").replace("&edge=curl", "").replace("zoom=1", "zoom=3"),
    };
  });
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`Could not download from ${new URL(url).host}`);
  return new Uint8Array(await res.arrayBuffer());
}
