# azw3

Turns an EPUB into a Kindle AZW3, for Shelfed's Kindle by cable. Shelfed runs it
as WebAssembly from `resources/azw3.wasm`, so nothing needs installing.

The conversion in `internal/` is [seapy/kindle-cli](https://github.com/seapy/kindle-cli)'s
`internal/epub` and `internal/azw3` (commit 3a8bdee), with only the import paths
changed. It writes KF8 with [leotaku/mobi](https://github.com/leotaku/mobi).
Both are MIT: see `LICENSE-kindle-cli` and `LICENSE-mobi`.

To rebuild after changing it, with Go 1.25 or newer:

```bash
npm run build:azw3
```
