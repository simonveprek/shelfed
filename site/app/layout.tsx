import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { asset } from "@/lib";
import "./globals.css";

const description =
  "A free, open-source ebook library for Mac and Windows. Keeps your books as plain files, reads every common format, converts between them, and sends them to your Kindle.";

export const metadata: Metadata = {
  // The address the site is hosted at, for links shared on social sites.
  metadataBase: new URL(process.env.SITE_URL ?? "https://simonveprek.github.io"),
  title: "Shelf, a quiet home for your books",
  description,
  icons: { icon: asset("icon.svg") },
  openGraph: { title: "Shelf", description, images: [asset("media/social.jpg")], type: "website" },
  twitter: { card: "summary_large_image", title: "Shelf", description, images: [asset("media/social.jpg")] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
