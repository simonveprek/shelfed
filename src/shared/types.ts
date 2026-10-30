// Shapes shared by the main process, the preload bridge and the window.

export type ReadStatus = "unread" | "reading" | "finished";

export type Annotation = {
  id: string;
  /** A highlight made here, a bookmarked page, or a highlight brought over from a Kindle. */
  kind: "highlight" | "bookmark" | "kindle";
  /** Where it sits in the book. Kindle highlights have no place Shelfed can open. */
  cfi?: string;
  /** The book's section it is in, so it can be drawn when that section loads. */
  index?: number;
  text?: string;
  note?: string;
  color?: "yellow" | "green" | "blue" | "pink";
  chapter?: string;
  fraction?: number;
  /** Kindle's own words for where it was, like Location 180. */
  where?: string;
  /** The file it was made in, since a place in an EPUB means nothing in a PDF. */
  ext?: string;
  created: number;
};

/** One book a catalogue offers for free. */
export type FreeBook = {
  id: string;
  source: "standard" | "gutenberg";
  title: string;
  author: string;
  cover?: string;
  epub: string;
  page: string;
  summary?: string;
};

export type Format = {
  /** Lower case extension without the dot, like epub or pdf. */
  ext: string;
  /** File name inside the book's folder. */
  file: string;
  size: number;
};

export type Book = {
  id: string;
  title: string;
  authors: string[];
  series?: string;
  seriesIndex?: number;
  description?: string;
  publisher?: string;
  published?: string;
  language?: string;
  isbn?: string;
  tags: string[];
  collections: string[];
  rating: number;
  status: ReadStatus;
  favorite: boolean;
  formats: Format[];
  /** Folder relative to the library root. */
  dir: string;
  /** Bumped whenever the cover changes, so cached images refresh. */
  cover: number;
  /** A colour taken from the cover, for placeholders. */
  tint?: string;
  added: number;
  modified: number;
  /** The names of the files it was brought over from on a Kindle, so it's known to be on it. */
  kindleNames?: string[];
  /** When someone last changed its title, authors or series by hand; an import then leaves them be. */
  edited?: number;
  opened?: number;
  /** Reading progress from 0 to 1. */
  progress?: number;
  /** Where reading stopped, a CFI for books and a page for PDFs. */
  location?: string;
  /** The file that place is in. The book reopens in it. */
  readFormat?: string;
  /** True once metadata has been read from the file. */
  parsed?: boolean;
  /** Content hash of the first file, to skip duplicates. */
  hash?: string;
  annotations?: Annotation[];
  /** When it was marked finished. */
  finishedAt?: number;
  /** Seconds spent reading it in Shelfed. */
  readSeconds?: number;
  /** Its spine colour in the bookcase, when picked by hand. */
  spine?: string;
  /** Its ribbon: a colour shows one always, "none" never, unset follows the bookcase. */
  ribbon?: string;
};

export type Collection = {
  id: string;
  name: string;
  created: number;
};

export type ThemeMode = "system" | "light" | "dark";

export type ReaderPrefs = {
  theme: "light" | "sepia" | "dark" | "black";
  font: "publisher" | "serif" | "sans";
  size: number;
  spacing: number;
  width: number;
  flow: "paginated" | "scrolled";
  justify: boolean;
  /** Reading aloud: the system voice chosen, by its id, and how fast it reads. */
  voice?: string;
  rate?: number;
};

/** How the 3D bookcase looks and sorts its shelves. */
export type BookcasePrefs = {
  /** One run of shelves, or a shelf of its own for each author, series and so on. */
  group: "none" | "author" | "series" | "collection" | "status" | "format";
  material: "paper" | "oak" | "walnut" | "slate";
  /** Spines in their cover's colour, in bookbinder's cloth, or in shades of ink. */
  spines: "cover" | "cloth" | "ink";
  /** Grows a small library to fill the window. */
  fit: boolean;
  /** Authors' names on the spines. */
  authors: boolean;
  /** A ribbon hanging from books being read. */
  ribbons: boolean;
  /** The ribbons' colour, "accent" for the theme's own. */
  ribbon: string;
  /** The case leans toward the pointer. */
  lean: boolean;
};

export type KindleSettings = {
  /** The Send to Kindle address, name@kindle.com. */
  to: string;
  /** The address mail is sent from. It must be approved in Amazon. */
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** True once a password is stored, encrypted, in the system keychain. */
  hasPassword: boolean;
  /** Preferred format for email. */
  format: "epub" | "pdf" | "original";
  /** Which Kindle it is, from the list in kindles.ts. */
  model?: string;
  /** Its colour. */
  finish?: string;
  /** Picked by hand, so a Kindle plugged in doesn't change it. */
  picked?: boolean;
};

export type SortKey =
  "added" | "title" | "author" | "rating" | "opened" | "series" | "progress" | "size";

export type Settings = {
  libraryPath: string;
  view: "grid" | "list" | "shelves" | "bookcase";
  gridSize: number;
  sort: SortKey;
  sortDir: "asc" | "desc";
  inspector: boolean;
  sidebar: boolean;
  pdfPage: "A5" | "A4" | "Letter" | "Kindle";
  kindle: KindleSettings;
  reader: ReaderPrefs;
  bookcase: BookcasePrefs;
  /** True once the welcome has been seen. */
  onboarded?: boolean;
  /** Look for new versions by itself. On unless turned off. */
  updates?: boolean;
  /** The app icon chosen in Settings, by its id in shared/icons. */
  icon?: string;
  /** Ebooks arriving in Downloads come in by themselves. On unless turned off. */
  downloads?: boolean;
  /** True once Shelfed has offered to bring a Calibre library over, so it asks only once. */
  calibreOffered?: boolean;
  /** The language Shelfed speaks; automatic follows the system. */
  language?: "auto" | "en" | "cs";
};

/** Where finding and getting a new version of Shelfed has got to. */
export type UpdateState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "none" }
  | { state: "downloading"; version: string; progress: number }
  /** Downloaded, and goes in on restart. Windows only. */
  | { state: "ready"; version: string }
  /** Out, to download from its page. macOS and Linux. */
  | { state: "available"; version: string; url: string }
  | { state: "failed"; error: string };

export type BootState = {
  books: Book[];
  collections: Collection[];
  settings: Settings;
  platform: NodeJS.Platform;
  version: string;
};

export type KindleDevice = { name: string; path: string; free: number; model?: string };

/** A book file on a Kindle plugged in as a drive: its name, where it is inside documents, and its size. */
/** A book file on a Kindle, by its path inside the documents folder. Locked ones are Amazon's, readable only on Kindles. */
export type KindleFile = { name: string; path: string; size: number; locked?: boolean };

/** A Kindle on the USB bus, mounted as a drive or not. */
export type KindleOnUsb = { serial: string; model?: string };

export type MetadataCandidate = {
  source: "openlibrary" | "google";
  url: string;
  title: string;
  authors: string[];
  description?: string;
  publisher?: string;
  published?: string;
  language?: string;
  isbn?: string;
  series?: string;
  tags: string[];
  cover?: string;
};

export const READABLE = ["epub", "mobi", "azw3", "azw", "kf8", "prc", "fb2", "fbz", "cbz", "pdf", "txt", "md", "markdown", "html", "htm", "xhtml", "docx"];

/** What Amazon takes by email today. MOBI and AZW3 no longer go through. */
export const KINDLE_EMAIL = ["epub", "pdf", "docx", "txt", "html", "htm", "rtf"];

/** What a Kindle reads when copied over by cable. */
export const KINDLE_USB = ["azw3", "azw", "mobi", "pdf", "txt", "kfx", "prc"];

/** Amazon's limit for one email. */
export const KINDLE_LIMIT = 50 * 1024 * 1024;
