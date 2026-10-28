// Command azw3 turns an EPUB into a Kindle AZW3, for copying to a Kindle by
// cable. Shelf builds it to WebAssembly (wasip1), so the one file runs on
// every system with nothing to install.
//
//	azw3 in.epub out.azw3 [title] [author]
//
// The conversion is seapy/kindle-cli's (internal/), on leotaku/mobi. Both MIT.
package main

import (
	"fmt"
	"os"

	"shelf/tools/azw3/internal/azw3"
	"shelf/tools/azw3/internal/epub"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: azw3 in.epub out.azw3 [title] [author]")
		os.Exit(2)
	}
	arg := func(i int) string {
		if len(os.Args) > i {
			return os.Args[i]
		}
		return ""
	}
	book, err := epub.Read(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, "reading the EPUB:", err)
		os.Exit(1)
	}
	warnings, err := azw3.Write(book, os.Args[2], azw3.Options{Title: arg(3), Author: arg(4)})
	for _, w := range warnings {
		fmt.Fprintln(os.Stderr, "warning:", w)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
