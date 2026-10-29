# Security

Shelfed opens files from anywhere, so it treats every book as untrusted. How the
window is locked down is described in the README, under
[Security model](README.md#security-model).

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately
through GitHub's [private vulnerability reporting](https://github.com/simonveprek/shelfed/security/advisories/new),
with the steps or a file that shows it. You'll get an answer within a week, and
credit in the release that fixes it, if you'd like.

Things worth reporting include a book that can run code, reach the network or
read files outside the library; a way around the window's sandbox; and anything
that leaks your mail password, which Shelfed keeps encrypted with your system's
keychain.

## Versions

Fixes go into the newest release. Shelfed updates itself on Windows and tells
you about new versions on macOS, so staying current is the way to stay safe.
