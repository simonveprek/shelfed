import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { asset } from "@/lib";
import "./globals.css";

const description =
  "A free, open-source ebook library for Mac and Windows. Keeps your books as plain files, reads every common format, converts between them, and sends them to your Kindle.";

export const metadata: Metadata = {
  // The address the site is hosted at, for links shared on social sites.
  metadataBase: new URL(process.env.SITE_URL ?? "https://shelfed.simonveprek.cz"),
  title: "Shelfed, a quiet home for your books",
  description,
  applicationName: "Shelfed",
  authors: [{ name: "Šimon Vepřek", url: "https://simonveprek.cz" }],
  creator: "Šimon Vepřek",
  keywords: ["ebook library", "ebook manager", "Calibre alternative", "Send to Kindle", "EPUB reader", "Kindle", "macOS", "Windows", "open source"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  icons: { icon: asset("icon.svg") },
  openGraph: { title: "Shelfed", description, images: [{ url: asset("media/social.jpg"), width: 1200, height: 630, alt: "Shelfed's bookcase, with the line A quiet home for your books" }], type: "website", siteName: "Shelfed" },
  twitter: { card: "summary_large_image", title: "Shelfed", description, images: [asset("media/social.jpg")] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
