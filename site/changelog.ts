/*
 * What changed in each version, the newest first, as the site's changelog page
 * shows it. Add a release here when bumping the version: a test holds the two together.
 */

export type Release = {
  version: string;
  /** When it came out, as a date. */
  date: string;
  summary: string;
  changes: string[];
};

export const RELEASES_MADE: Release[] = [
  {
    version: "0.1.3",
    date: "2026-10-30",
    summary: "See what a free book is before adding it.",
    changes: [
      "Click a book under You may also like, or on the Classics page, and a window shows its whole title, what it's about and where it comes from. You can add it from there.",
      "A suggestion that couldn't be found gets another try. If a free book shows up without its cover or Free button, opening it looks again.",
    ],
  },
  {
    version: "0.1.2",
    date: "2026-10-30",
    summary: "Bring books over from your Kindle.",
    changes: [
      "Plug in a Kindle and Shelfed shows the books on it that aren't in your library yet, and brings them over in one click. They're copied, so they stay on the Kindle too.",
      "Clearer email setup. Settings now says which services want an app password rather than the one you sign in with, and links to where you make one.",
      "The numbers in the side panel are for the shelf you're on, so On your Kindle counts the books on it, not your whole library.",
      "Library warnings are logged from the start, not only after the library is moved.",
    ],
  },
  {
    version: "0.1.1",
    date: "2026-10-29",
    summary: "The first release.",
    changes: [
      "Your library as plain files, one folder per author, readable with or without Shelfed.",
      "A reader for every common format, with highlights, notes, bookmarks and search, and reading aloud in your system's voices.",
      "Your Kindle, by name: recognised over USB, shown in 3D, and sent books by cable or email.",
      "Converting built in, with nothing else to install.",
      "Thousands of free classics, suggestions worked out on your computer, and details from Open Library and Google Books.",
      "Coming from Calibre: every book once, with its formats, cover, series and tags.",
      "In English and Czech, in light and dark, with no account and no tracking.",
    ],
  },
];
