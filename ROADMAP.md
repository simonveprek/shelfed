# Roadmap

Where Shelfed is going, roughly in order. These are plans, not promises: the order changes with what people ask for. A 👍 on an [issue](https://github.com/simonveprek/shelfed/issues) counts, and so does opening one.

## Now: 0.4

A library kept as plain files; a reader for every common format; converting with nothing else to install; Kindles, Kobos and PocketBooks recognised over USB and sent books by cable, Kindles by email, and CrossPoint readers over Wi-Fi; free classics and catalogues of your own; your reading kept in step with Hardcover if you want; suggestions worked out on your computer. Mac and Windows.

0.2 added a commonplace book of every line you've marked, a moment for finishing a book, and a bookcase that knows what you're reading. 0.4 copies books by cable to Kindles from 2024 on, which connect over MTP the way phones do, looks up words while you read, knows Kobo and PocketBook, sends books to CrossPoint readers over Wi-Fi, keeps your reading in step with your own Hardcover account if you connect it, and lets you add any OPDS catalogue, such as a Calibre content server.

## 0.5: alongside Calibre

- **A Calibre library, used where it is.** Opening a Calibre library in place, so Shelfed and Calibre can be used side by side on the same books, without importing a copy.
- **The rest of Calibre's data.** Its custom columns and read state, from `metadata.db`.
- **Saved searches, editing many books at once, and finding duplicates.**
- **Your library on your home network.** Turned on in Settings, Shelfed shares the library while it's open: a simple page a Kindle's browser can download books from, and an OPDS catalogue for reading apps such as KOReader.

## Later

- **Linux installers.** Shelfed runs on Linux from source, and CI tests it there. An AppImage and a `.deb` are mostly packaging.
- **A library in a synced folder.** Keeping the library in iCloud Drive or Dropbox, used from two computers, without the two overwriting each other's changes.

## Would like, but needs money

- **Signed on Windows.** The Mac app is signed and notarized since 0.2.2. Windows still asks through SmartScreen the first time, until there's a Windows certificate, which costs every year.

## Not planned

These keep Shelfed what it is:

- **Removing DRM.** Shelfed opens books you can open; it won't break locks on the ones you can't.
- **An account or a cloud service of Shelfed's own.** Your books and your reading stay on your computer. Connecting your own Hardcover account is up to you, and off until you do.
- **A store.** Shelfed points to free classics and that's it.
- **Everything Calibre does.** Calibre's news fetching and plugin system are its own. Shelfed aims to do the everyday things well, not all of them.
