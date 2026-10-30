Shelfed is a quiet home for your books, on Mac and Windows. Free and open source.

## New in 0.1.2

- **Bring books over from your Kindle.** Plug in a Kindle and Shelfed shows the books on it that aren't in your library yet, and brings them over in one click. They're copied, so they stay on the Kindle too. Books bought from Amazon are locked to Kindles and stay where they are; Shelfed says how many.
- **Clearer email setup.** Gmail, iCloud, Outlook and Yahoo don't take the password you sign in with. Settings now says so for the service you use, and links straight to where you make an app password. If the mail still turns the password away, the error says what to do.
- **The right count.** The numbers in the side panel are for the shelf you're on, so On your Kindle counts the books on it, not your whole library.
- **Library warnings are logged from the start**, not only after the library is moved.

## What's in it

- **Your library as plain files.** One folder per author in `Documents/Shelf Library`, readable with or without Shelfed. Covers, a list, shelves, or a 3D bookcase in paper, oak, walnut or slate.
- **A reader for every format.** EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, HTML and text, with highlights, notes, bookmarks and search. It opens every book where you stopped, and reads aloud in your system's voices.
- **Your Kindle, by name.** Plug one in and Shelfed recognises the model, from the Kindle 2 to the Colorsoft and Scribe, and shows it in 3D. Drag a book onto it to copy it across by cable, or send it by email from your own mail account. Books already on it get a badge, and a list of their own, and the ones you've finished can come off it in one go.
- **Converting, built in.** EPUB, AZW3 for Kindle, PDF, Word, FB2, plain text and web pages, with nothing else to install.
- **Finding books.** An empty library starts with eight classics in one click. Thousands more free classics from Standard Ebooks and Project Gutenberg, suggestions worked out from what you own, and details from Open Library and Google Books.
- **Coming from Calibre.** Shelfed finds your Calibre library by itself and offers to bring it over: every book once, with its formats, cover, series and tags.
- **Books you download come in by themselves.** A new EPUB, MOBI, AZW3, FB2 or comic in your Downloads folder joins the library while Shelfed is open.
- **In English and Czech.** Shelfed speaks your system's language, or the one you choose in Settings.
- **Yours.** Light and dark, eight app icons, a spine colour and a ribbon for every book. No account and no tracking.

## Download

| | |
| --- | --- |
| Mac with Apple silicon (M1 and later) | `Shelfed-0.1.2-mac-arm64.dmg` |
| Mac with Intel | `Shelfed-0.1.2-mac-x64.dmg` |
| Windows, ARM PCs too | `Shelfed-0.1.2-win-x64.exe` |

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
