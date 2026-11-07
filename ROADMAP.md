# Roadmap

Where Shelfed is going, roughly in order. These are plans, not promises: the order changes with what people ask for. A 👍 on an [issue](https://github.com/simonveprek/shelfed/issues) counts, and so does opening one.

## Now: 0.3

A library kept as plain files; a reader for every common format; converting with nothing else to install; Kindles recognised over USB and sent books by cable or email; free classics; suggestions worked out on your computer. Mac and Windows.

0.2 added a commonplace book of every line you've marked, a moment for finishing a book, and a bookcase that knows what you're reading. 0.3 copies books by cable to Kindles from 2024 on, which connect over MTP the way phones do, and looks up a word while you read.

## 0.4: other e-readers, other catalogues

- **Kobo and PocketBook.** Recognised when plugged in, shown with what's on them, and sent books by dragging, as Kindles are.
- **Your own catalogues.** Adding any OPDS catalogue, such as a Calibre content server or a library's, next to Standard Ebooks and Project Gutenberg.

## 0.5: alongside Calibre

- **A Calibre library, used where it is.** Opening a Calibre library in place, so Shelfed and Calibre can be used side by side on the same books, without importing a copy.
- **The rest of Calibre's data.** Its custom columns and read state, from `metadata.db`.
- **Saved searches, editing many books at once, and finding duplicates.**
- **Your library on your home network.** Turned on in Settings, Shelfed shares the library while it's open: a simple page a Kindle's browser can download books from, and an OPDS catalogue for reading apps such as KOReader.

## Later

- **Linux installers.** Shelfed runs on Linux from source, and CI tests it there. An AppImage and a `.deb` are mostly packaging.
- **A library in a synced folder.** Keeping the library in iCloud Drive or Dropbox, used from two computers, without the two overwriting each other's changes.

## Would like, but needs money

- **Signed builds.** No more warnings on first launch, and updates that install themselves on a Mac too. This needs paid certificates from Apple and for Windows, every year. If Shelfed finds enough people, it'll happen.

## Not planned

These keep Shelfed what it is:

- **Removing DRM.** Shelfed opens books you can open; it won't break locks on the ones you can't.
- **An account or a cloud service.** Your books and your reading stay on your computer.
- **A store.** Shelfed points to free classics and that's it.
- **Everything Calibre does.** Calibre's news fetching and plugin system are its own. Shelfed aims to do the everyday things well, not all of them.
