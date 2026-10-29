The first release of Shelfed: a quiet home for your books, on Mac and Windows. Free and open source.

## What's in it

- **Your library as plain files.** One folder per author in `Documents/Shelf Library`, readable with or without Shelfed. Covers, a list, shelves, or a 3D bookcase in paper, oak, walnut or slate.
- **A reader for every format.** EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, HTML and text, with highlights, notes, bookmarks and search. It opens every book where you stopped.
- **Your Kindle, by name.** Plug one in and Shelfed recognises the model, from the Kindle 2 to the Colorsoft and Scribe, and shows it in 3D. Drag a book onto it to copy it across by cable, or send it by email from your own mail account. Books already on it get a badge, and a list of their own.
- **Converting, built in.** EPUB, AZW3 for Kindle, PDF, Word, FB2, plain text and web pages, with nothing else to install.
- **Finding books.** Thousands of free classics from Standard Ebooks and Project Gutenberg, suggestions worked out from what you own, and details from Open Library and Google Books.
- **Yours.** Light and dark, eight app icons, a spine colour and a ribbon for every book. No account and no tracking.

## Download

| | |
| --- | --- |
| Mac with Apple silicon (M1 and later) | `Shelfed-0.1.0-mac-arm64.dmg` |
| Mac with Intel | `Shelfed-0.1.0-mac-x64.dmg` |
| Windows, most PCs | `Shelfed-0.1.0-win-x64.exe` |
| Windows on ARM | `Shelfed-0.1.0-win-arm64.exe` |

## Opening it the first time

Shelfed isn't signed with a paid certificate yet, so your computer asks before opening it.

- **macOS 15 and later:** open Shelfed once and choose **Done**. Then go to **System Settings → Privacy & Security**, click **Open Anyway** next to Shelfed, and enter your password.
- **macOS 14 and earlier:** right-click Shelfed in Applications and choose **Open**.
- **If macOS says the app is damaged:** run `xattr -cr /Applications/Shelfed.app` once in Terminal.
- **Windows:** if SmartScreen appears, choose **More info**, then **Run anyway**.

## Good to know

What's coming next is in the [roadmap](https://github.com/simonveprek/shelfed/blob/main/ROADMAP.md).


- **Kindles from 2024 on** (the 2024 Paperwhite, Colorsoft and Kindle) connect the way phones do, not as a drive, so Shelfed sends to them by email for now, and says so when you plug one in. Older Kindles also take books by cable.
- **Books with DRM**, as most bought from Amazon are, won't open. Shelfed doesn't remove DRM.
- **Coming from Calibre:** drop its library folder on Shelfed. Each book comes in once, with all its formats, its cover, and the title, authors, series, tags and rating you gave it in Calibre, even one Calibre kept twice in two formats. A series written into a title, like “The King of the West (Path of the Ranger Book 7)”, becomes the book's series. Calibre's custom columns don't come across.
- **Kindle files made by Shelfed** (AZW3) are new in this release. If one doesn't look right on your Kindle, please open an issue.
- **Updates:** on Windows, new versions download and install on restart. On a Mac, Shelfed tells you when one is out and links to it.
