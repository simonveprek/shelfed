# Third-party software in Shelfed

Shelfed is built on these projects, each under its own licence. Their licence
texts ship inside the app with each package.

| Project | Licence | Used for |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) | MIT | The app itself |
| [React](https://github.com/facebook/react) | MIT | The interface |
| [foliate-js](https://github.com/johnfactotum/foliate-js) | MIT | Reading EPUB, MOBI, AZW3, FB2 and comics |
| [PDF.js](https://github.com/mozilla/pdf.js) | Apache 2.0 | Reading PDF |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Making EPUBs, Word files |
| [leotaku/mobi](https://github.com/leotaku/mobi) | MIT | Writing Kindle AZW3 files |
| [seapy/kindle-cli](https://github.com/seapy/kindle-cli) | MIT | Turning EPUB into AZW3, in `tools/azw3` |
| [Go](https://go.dev) and golang.org/x/image, net and text | BSD 3-Clause | The AZW3 converter, built to WebAssembly |
| [go-webview2](https://github.com/jchv/go-webview2) | MIT | The Windows installer's window, in `tools/installer` |
| [go-winloader](https://github.com/jchv/go-winloader) | ISC | Loading WebView2 for the Windows installer |
| golang.org/x/sys | BSD 3-Clause | The Windows installer |
| [electron-updater](https://github.com/electron-userland/electron-builder) | MIT | Updates |
| [electron-log](https://github.com/megahertz/electron-log) | MIT | The log file |
| [Mammoth](https://github.com/mwilliamson/mammoth.js) | BSD 2-Clause | Reading Word files |
| [Nodemailer](https://github.com/nodemailer/nodemailer) | MIT-0 | Sending to Kindle by email |
| [Motion](https://github.com/motiondivision/motion) | MIT | Animation |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | App state |
| [TanStack Virtual](https://github.com/TanStack/virtual) | MIT | Long lists |
| [Hugeicons](https://github.com/hugeicons/hugeicons) | MIT | Icons |
| [Geist](https://github.com/vercel/geist-font) | SIL Open Font License 1.1 | Type |
| [next-themes](https://github.com/pacocoursey/next-themes) | MIT | Light and dark |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | Styles |

Free books come from [Standard Ebooks](https://standardebooks.org) and
[Project Gutenberg](https://www.gutenberg.org); book details from
[Open Library](https://openlibrary.org) and Google Books.
