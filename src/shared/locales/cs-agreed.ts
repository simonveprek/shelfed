/**
 * Czech settled once for the whole app, where its parts first said it in
 * different ways, and the words that mean different things in different
 * places ("text@place", read by tc()). Loaded last, so these win.
 */
const words: Record<string, string> = {
  // Places, states and sections that share an English word.
  Reading: "Rozečtené",
  "Reading@status": "Čtu",
  "Reading@settings": "Čtení",
  Finished: "Dočtené",
  "Finished@status": "Dočteno",
  "To read@status": "Chci číst",
  "Paper@page": "Světlé",
  Paper: "Papír",

  // One way of saying it everywhere.
  "your Downloads": "ze stažených souborů",
  "Joined {n} copy to its book|Joined {n} copies to their books": "{n} kopie připojena ke své knize|{n} kopie připojeny ke svým knihám|{n} kopií připojeno ke svým knihám",
  "Reads everywhere. Best for Kindle by email": "Otevře se všude. Nejlepší pro Kindle e-mailem",
  "On your Kindle": "V Kindlu",
  "This Kindle connects like a phone, and a Mac can't open it as a drive, so Shelfed can't copy books to it by cable. Send them by email instead.":
    "Tento Kindle se připojuje jako telefon a Mac ho neumí otevřít jako disk, takže do něj Shelfed nemůže kopírovat knihy kabelem. Posílejte je raději e-mailem.",
  "This Kindle connects like a phone, not as a drive, so Shelfed can't copy books to it by cable yet. Send them by email instead.":
    "Tento Kindle se připojuje jako telefon, ne jako disk, takže do něj Shelfed zatím nemůže kopírovat knihy kabelem. Posílejte je raději e-mailem.",
  Publisher: "Nakladatel",
  "Last opened": "Naposledy otevřeno",
  Favorite: "Oblíbená",
  "Find details online": "Najít údaje online",
  "Edit details": "Upravit údaje",
  Details: "Údaje",
  "{n} of your books is on it.|{n} of your books are on it.": "Je v něm {n} vaše kniha.|Jsou v něm {n} vaše knihy.|Je v něm {n} vašich knih.",
  "Bring them over": "Přenést sem",
  "Bookcase in 3D": "Knihovnička ve 3D",
  "Page turns": "Otáčení stránek",
  Pages: "Po stránkách",

  // The menus Electron would otherwise fill with English.
  "Edit@menu": "Úpravy",
  Undo: "Zpět",
  Redo: "Znovu",
  Cut: "Vyjmout",
  Paste: "Vložit",
  "Select All": "Vybrat vše",
  Window: "Okno",
  Minimise: "Minimalizovat",
  Zoom: "Změnit velikost",
  "Bring All to Front": "Vše do popředí",
  "Close Window": "Zavřít okno",
  "Full Screen": "Celá obrazovka",
  "Hide Shelfed": "Skrýt Shelfed",
  "Hide Others": "Skrýt ostatní",
  "Show All": "Zobrazit vše",
  "Quit Shelfed": "Ukončit Shelfed",

  // A first shelf of classics.
  "Start with a few classics": "Pár klasik na začátek",
  "Fetching classics…": "Stahuji klasiku…",
  "Fetching a few classics": "Stahuji pár klasik",
  "{n} of {total}|{n} of {total}": "{n} z {total}|{n} z {total}|{n} z {total}",
  "Fetched {n} classic|Fetched {n} classics": "Stažena {n} klasika|Staženy {n} klasiky|Staženo {n} klasik",
  "Couldn't reach Standard Ebooks. Check the internet and try again.": "Standard Ebooks se nepodařilo zastihnout. Zkontrolujte připojení k internetu a zkuste to znovu.",

  // Reading aloud.
  "Read aloud": "Číst nahlas",
  "Stop reading aloud": "Přestat číst nahlas",
  "A paragraph back": "O odstavec zpět",
  "A paragraph on": "O odstavec dál",
  Pause: "Pozastavit",
  "Read on": "Číst dál",
  Speed: "Rychlost",
  Voice: "Hlas",

  // The 3D bookcase.
  Birch: "Bříza",
  Cherry: "Třešeň",
  Ebony: "Eben",
  White: "Bílá",
  Sage: "Šalvějová",
  Navy: "Námořnická modrá",
  "Order on the shelf": "Pořadí na polici",
  "As the library is sorted": "Jak je seřazená knihovna",
  "Rainbow, by spine colour": "Duha, podle barvy hřbetu",
  "By title": "Podle názvu",
  "By author": "Podle autora",
  "Shelf lights": "Osvětlení polic",
  "A warm light under every shelf.": "Teplé světlo pod každou policí.",
  "Bookends and plants": "Zarážky a kytky",
  "Bookends hold every shelf, with a plant, a lamp or a few books lying flat beside them.": "Zarážky drží každou polici a vedle nich stojí kytka, lampička nebo pár knih naležato.",
};

export default words;
