<p align="center">
  <img src="build/icon.png" width="112" alt="" />
</p>

<h1 align="center">Shelf</h1>

<p align="center">
  A quiet home for your books, on macOS and Windows.<br />
  Read, organise and convert them, and send them to your Kindle.
</p>

<p align="center">
  <a href="https://github.com/simonveprek/shelf/releases/latest"><b>Download</b></a> ·
  <a href="https://simonveprek.github.io/shelf">Website</a> ·
  <a href="#build-it">Build it</a>
</p>

<p align="center">
  <img src="docs/media/views.gif" width="880" alt="A library shown as covers, a list, shelves and a 3D bookcase" />
</p>

## What it does

- **Reads everything.** EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, HTML and text, with highlights, notes, bookmarks and search. It opens where you stopped.
- **Keeps your library as plain files.** One folder per author in `Documents/Shelf Library`, readable without the app.
- **Converts.** To EPUB, PDF, text or a web page with nothing else installed. With [Calibre](https://calibre-ebook.com) it also makes AZW3, MOBI and Word.
- **Sends to your Kindle.** By email from your own mail account, or by cable.
- **Finds details.** Descriptions, publishers and better covers from Open Library and Google Books.
- **Brings back your Kindle highlights**, from `My Clippings.txt`.
- **Classics, free.** Thousands of books from Standard Ebooks and Project Gutenberg, one click to add.
- **Suggests what's next.** Jane Eyre? Try Wuthering Heights. Worked out on your computer, never sent anywhere.

### A bookcase you arrange

Shelves by author, series, collection or reading status. Paper, oak, walnut or slate. Spines in their cover's colour, in bookbinder's cloth or in ink, and a ribbon in every book you're reading, in any colour.

<p align="center"><img src="docs/media/bookcase.gif" width="880" alt="The 3D bookcase changing material, spines and shelves" /></p>

### Your Kindle, recognised

Plug a Kindle in and Shelf knows which one it is, from the Kindle 2 to the Colorsoft and Scribe, from its serial number. It shows it in 3D, in its own colour.

<p align="center"><img src="docs/media/kindle-plug.gif" width="880" alt="A Kindle being plugged in, rising over the library" /></p>

Drag a book onto it to copy it across. When it isn't plugged in, the same drop sends it by email.

<p align="center"><img src="docs/media/kindle-drop.gif" width="880" alt="The Great Gatsby dragged from the bookcase onto the Kindle" /></p>

### A reader that remembers

<p align="center"><img src="docs/media/reader.gif" width="880" alt="Reading Pride and Prejudice" /></p>

### It starts slowly, on purpose

<p align="center"><img src="docs/media/onboarding.gif" width="880" alt="Shelf's opening, about reading" /></p>

## Install

Download the installer for your system from [the latest release](https://github.com/simonveprek/shelf/releases/latest).

The builds aren't signed yet:

- **macOS:** the first time, right-click Shelf in Applications and choose **Open**. If macOS says the app is damaged, run `xattr -cr /Applications/Shelf.app` once.
- **Windows:** if SmartScreen says it protected your PC, choose **More info**, then **Run anyway**.

## Build it

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs Shelf, reloading as you edit |
| `npm test` | Runs the tests |
| `npm run check` | Typechecks, then runs the tests |
| `npm run dist:mac` | Makes the macOS installer in `dist` |
| `npm run dist:win` | Makes the Windows installer in `dist` |

The tests cover the library on disk under hundreds of imports at once, Kindle highlights, recommendations, the book sanitiser, EPUB making and Kindle recognition. CI runs them, and packs the app, on macOS, Windows and Linux. Pushing a tag like `v0.2.0` builds installers into a draft release.

| Path | What it is |
| --- | --- |
| `src/main` | The library on disk, Kindle by mail and cable, Calibre, PDF printing, book details |
| `src/renderer/src/components` | Shelf's screens |
| `src/renderer/src/components/ui` | The Fragms Personal kit (see Licence) |
| `src/renderer/src/components/fragms` | Fragms components |
| `src/renderer/src/reader` | The reader, on foliate-js and PDF.js |
| `src/renderer/src/lib` | State, importing, converting, sending and suggestions |
| `src/shared` | Types and the list of Kindles |
| `test` | Tests, with Vitest |
| `site` | The website |

## Privacy

No account and no tracking. Shelf only goes online when you ask it to: for book details (Open Library, Google Books), free classics (Standard Ebooks, Project Gutenberg), and sending to your Kindle through your own mail server.

## Licence

Shelf's own code is [MIT](LICENSE).

The UI kit it's built on, **Fragms Personal**, is not open source. It is in `src/renderer/src/components/ui/`, `components/bits.tsx`, `components/character.tsx` and `src/renderer/src/kit.css`, under [its own licence](LICENSE-FRAGMS-PERSONAL.md). You may read, build, run and change it as part of Shelf, but not use it in other projects or publish it on its own.

The [Fragms](https://fragms.simonveprek.cz) components in `components/fragms/` are MIT, as their headers say. Other projects Shelf uses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Made by [Šimon Vepřek](https://simonveprek.cz).
