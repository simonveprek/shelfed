# Contributing to Shelfed

Thank you for helping. A few things to know first.

## Running it

```bash
npm install
npm run dev
```

Before a pull request, run `npm run check`. It typechecks and runs the tests.

## The Fragms Personal kit is not open source

Shelfed's own code is MIT. The UI kit it's built on is not:
`src/renderer/src/components/ui/`, `components/bits.tsx`,
`components/character.tsx` and `src/renderer/src/kit.css` are under
[LICENSE-FRAGMS-PERSONAL.md](LICENSE-FRAGMS-PERSONAL.md). You may change them
for Shelfed, but not copy them into other projects. Contributions to those files
are licensed to the author under the same terms.

## Style

- Build screens from the kit's components rather than new one-off styles.
- Comments explain why, in plain sentences.
- Words in the app are short and plain: "Add books", not "Import media assets".
- Anything that touches the library on disk needs a test in `test/library.test.ts`.

## Your Kindle

If Shelfed doesn't recognise your Kindle, open an issue with its model and the
first six characters of its serial number (Settings, Device Options, Device
Info on the Kindle). Never post the whole serial.
