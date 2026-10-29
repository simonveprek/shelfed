# Roadmap

Where Shelfed is going, roughly in order. These are plans, not promises: the order changes with what people ask for. A 👍 on an [issue](https://github.com/simonveprek/shelfed/issues) counts, and so does opening one.

## Now: 0.1

The first release. A library kept as plain files; a reader for every common format; converting with nothing else to install; Kindles recognised over USB and sent books by cable or email; free classics; suggestions worked out on your computer. Mac and Windows, x64 and ARM.

## Next

The gaps people will hit first.

- **Cable copying to Kindles from 2024 on, on Windows.** These connect over MTP rather than as a drive. Windows has MTP built in (Windows Portable Devices), so Shelfed can copy to them there, and tell which books they already hold, as it does for older Kindles.
- **Calibre's own data.** Dropping a Calibre library in brings its books today. Next is reading Calibre's `metadata.db` too: tags, series and their order, ratings, and edited titles and authors, so moving across loses nothing.
- **Linux installers.** Shelfed runs on Linux from source, and CI tests it there. An AppImage and a `.deb` are mostly packaging.
- **Managing what's on a Kindle.** Shelfed shows which of your books are on a plugged-in Kindle. Next is removing them from it, and seeing what's on it that isn't in your library.

## Later

- **MTP on macOS.** macOS has no MTP support of its own, so newer Kindles need a USB implementation inside Shelfed. Until then they get books by email.
- **Kobo, PocketBook and other e-readers.** Most open as a drive, so copying is close to what Shelfed already does for Kindles. What's left is recognising them and showing what's on them.
- **Your own catalogues.** Adding any OPDS catalogue, such as a Calibre content server or a library's, next to Standard Ebooks and Project Gutenberg.
- **A library in a synced folder.** Keeping the library in iCloud Drive or Dropbox, used from two computers, without the two overwriting each other's changes.
- **Reading aloud**, with the voices your system already has.
- **Looking up a word** while reading.

## Would like, but needs money

- **Signed builds.** No more warnings on first launch, and updates that install themselves on a Mac too. This needs paid certificates from Apple and for Windows, every year. If Shelfed finds enough people, it'll happen.

## Not planned

These keep Shelfed what it is:

- **Removing DRM.** Shelfed opens books you can open; it won't break locks on the ones you can't.
- **An account or a cloud service.** Your books and your reading stay on your computer.
- **A store.** Shelfed points to free classics and that's it.
- **Everything Calibre does.** Calibre's news fetching, content server and plugin system are its own. Shelfed aims to do the everyday things well, not all of them.
