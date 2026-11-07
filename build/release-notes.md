Shelfed is a quiet home for your books, on Mac and Windows. Free and open source.

## New in 0.2.0

- **PDFs made into real EPUBs.** Shelfed reads a PDF the way a book is laid out: chapters from its bookmarks or headings, paragraphs and broken words joined back up, two columns in order, pictures kept, and the running heads and page numbers left out. Look it over first, name the chapters and choose what to keep, from Convert or the book's menu.
- **Select books by drawing a box.** Drag over the covers or down the list, as on the desktop. Hold Cmd or Ctrl to add to what's selected, and near the edge the view scrolls on.
- **A commonplace book.** Every line you've marked, in every book, gathered in one place in the sidebar. Search it, copy it out as Markdown, or open a book right where the line is.
- **Finishing a book is a moment.** On the last page Shelfed asks how you liked it, shows how long it took and how much you marked, and offers what's next: the next book in the series first.
- **A reading pile.** What you're reading lies in a pile on top of the bookcase, the one you opened last on top.
- **Box sets.** A series stands together, every spine the same height, with a band across them.
- **Rainbow order.** A shelf can run through its spines' colours. Turn it on in the bookcase's options.
- **A lighter bookcase.** The 3D bookcase draws only what you can see, so a big library stays smooth.
- **The reader follows the app.** In dark mode the page is dark too, unless you choose a paper yourself.
- **Polish everywhere.** The list keeps titles readable at any width, covers stay one size, books without a cover wear their spine's colour, and free books have fuller descriptions.
- **What's new, a click away.** Settings links to the changelog on the website.

## What's in it

- **Your library as plain files.** One folder per author in `Documents/Shelf Library`, readable with or without Shelfed. Covers, a list, shelves, or a 3D bookcase in paper, oak, walnut or slate.
- **A reader for every format.** EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, HTML and text, with highlights, notes, bookmarks and search. It opens every book where you stopped, reads aloud in your system's voices, and gathers what you mark into a commonplace book.
- **Your Kindle, by name.** Plug one in and Shelfed recognises the model, from the Kindle 2 to the Colorsoft and Scribe, and shows it in 3D. Drag a book onto it to copy it across by cable, or send it by email from your own mail account. Books already on it get a badge, and a list of their own, and the ones you've finished can come off it in one go.
- **Converting, built in.** EPUB, AZW3 for Kindle, PDF, Word, FB2, plain text and web pages, with nothing else to install. A PDF becomes a real EPUB, with its chapters, headings and pictures, and you can look it over first.
- **Finding books.** An empty library starts with eight classics in one click. Thousands more free classics from Standard Ebooks and Project Gutenberg, suggestions worked out from what you own, and details from Open Library and Google Books.
- **Coming from Calibre.** Shelfed finds your Calibre library by itself and offers to bring it over: every book once, with its formats, cover, series and tags.
- **Books you download come in by themselves.** A new EPUB, MOBI, AZW3, FB2 or comic in your Downloads folder joins the library while Shelfed is open.
- **In English and Czech.** Shelfed speaks your system's language, or the one you choose in Settings.
- **Yours.** Light and dark, eight app icons, a spine colour and a ribbon for every book. No account and no tracking.

## Download

| | |
| --- | --- |
| Mac with Apple silicon (M1 and later) | `Shelfed-0.2.0-mac-arm64.dmg` |
| Mac with Intel | `Shelfed-0.2.0-mac-x64.dmg` |
| Windows, ARM PCs too | `Shelfed-0.2.0-win-x64.exe` |

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
- **Kindle files made by Shelfed** (AZW3): if one doesn't look right on your Kindle, please open an issue.
- **Updates:** on Windows, new versions download and install on restart. On a Mac, Shelfed tells you when one is out and links to it.
