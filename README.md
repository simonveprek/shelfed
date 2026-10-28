# Shelf

![Shelf](build/icon.png)

A fast, quiet home for your books, on Windows and macOS. Built with Electron
and the Fragms Personal kit (`src/renderer/src/components/ui`, copied as is
from `fragms-personal/template`).

## Run it

```bash
npm install
npm run dev
```

`npm run dist:mac` and `npm run dist:win` make an installer in `dist`.

## Check it

```bash
npm test
npm run check
```

`npm test` runs the tests in `test/`: the library on disk under hundreds of
imports at once, Kindle highlights, recommendations, the book sanitiser, EPUB
making and Kindle recognition. `npm run check` typechecks first. CI runs both,
and a build, on macOS, Windows and Linux.

## What it does

- Reads EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, HTML and text, with covers and details taken from the files.
- Covers, list, shelves and a 3D bookcase, collections, favorites, ratings, tags, search and a command menu on Cmd K.
- A reader with pages or scroll, four page colours and type settings. It remembers where you stopped.
- Converts to EPUB, PDF, text or a web page with nothing else installed. With Calibre it also makes AZW3, MOBI and Word.
- Sends to Kindle by email from your own mail account, or copies to a Kindle plugged in by cable.
- Finds descriptions, publishers and better covers on Open Library and Google Books.

The library lives in `Documents/Shelf Library` by default, one folder per
author, so it stays readable without the app.

| Path | What it is |
| --- | --- |
| `src/main` | Library on disk, Kindle mail and cable, Calibre, PDF printing, metadata lookups |
| `src/renderer/src/components/ui`, `fragms`, `bits.tsx` | The Fragms Personal kit, unchanged |
| `src/renderer/src/components` | Shelf's screens, built only from the kit |
| `src/renderer/src/reader` | The reader, on foliate-js and pdf.js |
| `src/renderer/src/lib` | Store, importing, converting and sending |
| `test` | Tests, run with Vitest |
