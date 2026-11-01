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
};

export default words;
