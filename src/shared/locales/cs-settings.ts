/** Czech for settings. English text as it is in the code, then its Czech. Counts: "{n} book|{n} books" → "{n} kniha|{n} knihy|{n} knih". */
const words: Record<string, string> = {
  // The window
  Settings: "Nastavení",
  Close: "Zavřít",
  Library: "Knihovna",
  Appearance: "Vzhled",
  Reading: "Čtení",
  Kindle: "Kindle",
  Sending: "Odesílání",
  Converting: "Převádění",
  "About Shelfed": "O aplikaci Shelfed",

  // Library
  "Your books live in a plain folder, one folder for each author, so they stay yours and readable without Shelfed.":
    "Vaše knihy jsou v obyčejné složce, každý autor ve své, takže zůstanou vaše a dají se číst i bez aplikace Shelfed.",
  "Show in Finder": "Zobrazit ve Finderu",
  "Show in Explorer": "Zobrazit v Průzkumníkovi",
  "Show in Folder": "Zobrazit ve složce",
  "Open in Finder": "Otevřít ve Finderu",
  "Open in Explorer": "Otevřít v Průzkumníkovi",
  "Open in Folder": "Otevřít ve složce",
  "Switched to the new library folder": "Knihovna je teď v nové složce",
  "Move…": "Přesunout…",
  "book|books": "kniha|knihy|knih",
  "author|authors": "autor|autoři|autorů",
  "on disk": "na disku",
  Downloads: "Stažené soubory",
  "Add books you download": "Přidávat stažené knihy",
  "New EPUB, MOBI, AZW3, FB2 and comic files in your Downloads folder come in by themselves while Shelfed is open. PDFs and documents stay where they are.":
    "Nové soubory EPUB, MOBI, AZW3, FB2 a komiksy ze složky Stažené soubory se přidají samy, dokud je Shelfed otevřený. PDF a dokumenty zůstanou, kde jsou.",
  "The first time": "Poprvé",
  "The welcome": "Uvítání",
  "The short story about reading Shelfed opens with.": "Krátký příběh o čtení, kterým Shelfed začíná.",
  "Show it again": "Zobrazit znovu",
  "Your Calibre library": "Vaše knihovna Calibre",
  "{n} book in {path}. Bring them over, with their formats, covers, series and tags. Calibre's library isn't changed, and books already here are skipped.|{n} books in {path}. Bring them over, with their formats, covers, series and tags. Calibre's library isn't changed, and books already here are skipped.":
    "{n} kniha ve složce {path}. Přeneste ji sem i s formáty, obálkami, sériemi a štítky. Knihovna Calibre zůstane beze změny a knihy, které tu už máte, se přeskočí.|" +
    "{n} knihy ve složce {path}. Přeneste je sem i s formáty, obálkami, sériemi a štítky. Knihovna Calibre zůstane beze změny a knihy, které tu už máte, se přeskočí.|" +
    "{n} knih ve složce {path}. Přeneste je sem i s formáty, obálkami, sériemi a štítky. Knihovna Calibre zůstane beze změny a knihy, které tu už máte, se přeskočí.",
  "Bring them over": "Přenést sem",
  Copies: "Kopie",
  "The same book twice": "Stejná kniha dvakrát",
  "{n} book is a copy of another in a different format, with the same title and author. Joined, each becomes one book with both files.|{n} books are copies of another in a different format, with the same title and author. Joined, each becomes one book with both files.":
    "{n} kniha je kopií jiné knihy v jiném formátu, se stejným názvem i autorem. Po spojení z nich bude jedna kniha s oběma soubory.|" +
    "{n} knihy jsou kopiemi jiných knih v jiném formátu, se stejným názvem i autorem. Po spojení bude z každé dvojice jedna kniha s oběma soubory.|" +
    "{n} knih je kopiemi jiných knih v jiném formátu, se stejným názvem i autorem. Po spojení bude z každé dvojice jedna kniha s oběma soubory.",
  "No book here is a copy of another in a different format. Books that come in as copies join up by themselves.":
    "Žádná kniha tu není kopií jiné v jiném formátu. Knihy, které přibudou jako kopie, se spojí samy.",
  "Joined {n} copy to its book|Joined {n} copies to their books":
    "{n} kopie spojena se svou knihou|{n} kopie spojeny se svými knihami|{n} kopií spojeno se svými knihami",
  "Joining…": "Spojování…",
  "Join {n}": "Spojit {n}",
  "None found": "Žádné nejsou",

  // Appearance
  Language: "Jazyk",
  "Shelfed speaks your system's language unless you choose one.": "Shelfed mluví jazykem vašeho systému, pokud nevyberete jiný.",
  "Automatic ({language})": "Automaticky ({language})",
  "Light, dark, or following your system through the day.": "Světlý, tmavý, nebo během dne podle systému.",
  Auto: "Automaticky",
  Light: "Světlý",
  Dark: "Tmavý",
  "App icon": "Ikona aplikace",
  "Shows in the Dock while Shelfed is open.": "Zobrazuje se v Docku, dokud je Shelfed otevřený.",
  "Shows on the taskbar while Shelfed is open.": "Zobrazuje se na hlavním panelu, dokud je Shelfed otevřený.",
  "The bookcase has its own look, in its menu: shelves, wood, spines and ribbons.":
    "Knihovnička má vlastní vzhled ve svém menu: police, dřevo, hřbety a stužky.",
  // App icon names
  Paper: "Papír",
  Nebula: "Mlhovina",
  Spectrum: "Spektrum",
  Foil: "Fólie",
  Candy: "Bonbon",
  Lux: "Lux",
  Zen: "Zen",
  Sky: "Nebe",

  // Reading
  "How books look when you open them. Size, spacing and page colour change from the Aa button while you read.":
    "Jak knihy vypadají, když je otevřete. Velikost, řádkování a barvu stránky změníte při čtení tlačítkem Aa.",
  Type: "Písmo",
  "The book's": "Z knihy",
  Serif: "Patkové",
  Sans: "Bezpatkové",
  "Justify text": "Zarovnat do bloku",
  "Even edges on both sides, with hyphens.": "Rovné okraje na obou stranách, s dělením slov.",
  "Turning pages": "Otáčení stránek",
  "Page turns": "Stránkování",
  "One page at a time, like a book.": "Jedna stránka po druhé, jako v knize.",
  "One long page, like the web.": "Jedna dlouhá stránka, jako na webu.",
  Pages: "Stránky",
  Scroll: "Posouvání",

  // Kindle
  "Plug your Kindle in and Shelfed recognises it. Or pick it here, and choose its colour.":
    "Připojte Kindle a Shelfed ho pozná. Nebo ho vyberte tady a zvolte jeho barvu.",
  "Plug it in, or pick it from the list": "Připojte ho, nebo ho vyberte ze seznamu",
  "Not known yet": "Zatím neznámý",
  "{year}, {size}″ screen": "{year}, displej {size}″",
  "{year}, {size}″ colour screen": "{year}, barevný displej {size}″",
  "Plugged in": "Připojený",
  "A Kindle Shelfed doesn't know is plugged in": "Je připojený Kindle, který Shelfed nezná",
  "{n} of your books is on it.|{n} of your books are on it.":
    "Je na něm {n} vaše kniha.|Jsou na něm {n} vaše knihy.|Je na něm {n} vašich knih.",
  "This Kindle connects like a phone, and a Mac can't open it as a drive, so Shelfed can't copy books to it by cable. Send them by email instead.":
    "Tento Kindle se připojuje jako telefon a Mac ho neumí otevřít jako disk, takže do něj Shelfed nemůže kopírovat knihy kabelem. Posílejte je raději e-mailem.",
  "This Kindle connects like a phone, not as a drive, so Shelfed can't copy books to it by cable yet. Send them by email instead.":
    "Tento Kindle se připojuje jako telefon, ne jako disk, takže do něj Shelfed zatím nemůže kopírovat knihy kabelem. Posílejte je raději e-mailem.",
  "{n} book you've finished is still on it, using {size}.|{n} books you've finished are still on it, using {size}.":
    "Pořád je na něm {n} dočtená kniha a zabírá {size}.|Pořád jsou na něm {n} dočtené knihy a zabírají {size}.|Pořád je na něm {n} dočtených knih a zabírají {size}.",
  "Take them off": "Odebrat je",
  Model: "Model",
  "Recognise it when plugged in": "Poznat po připojení",
  "Play the plug-in animation": "Přehrát animaci připojení",
  "From your Kindle": "Z Kindlu",
  "Highlights and notes": "Zvýraznění a poznámky",
  "Brings what you marked on a Kindle into the books here, from its My Clippings file.":
    "Přenese do knih tady, co jste si označili na Kindlu, ze souboru My Clippings.",
  Import: "Importovat",
  // Kindle finishes (shared/kindles.ts)
  Black: "Černá",
  White: "Bílá",
  Graphite: "Grafitová",
  Silver: "Stříbrná",
  "Twilight blue": "Soumrakově modrá",
  Plum: "Švestková",
  Sage: "Šalvějová",
  "Agave green": "Agávově zelená",
  Denim: "Džínová",
  "Champagne gold": "Šampaňská zlatá",
  Tungsten: "Wolframová",
  Jade: "Nefritová",
  Raspberry: "Malinová",
  Matcha: "Matcha",
  "Metallic black": "Metalická černá",
  Fig: "Fíková",

  // Sending
  "Sending by email": "Odesílání e-mailem",
  "Every Kindle has an email address. Shelfed mails books to it from your own account, and Amazon puts them on all your Kindles and Kindle apps.":
    "Každý Kindle má e-mailovou adresu. Shelfed na ni posílá knihy z vašeho vlastního účtu a Amazon je nahraje do všech vašich Kindlů a aplikací Kindle.",
  "Signed in to your mail. Ready to send": "Přihlášeno k vaší poště. Můžete posílat",
  "Ready to send to {address}": "Připraveno posílat na {address}",
  "Not set up yet. Three steps, once.": "Zatím nenastaveno. Tři kroky, jen jednou.",
  "Let your address send to your Kindle": "Povolte své adrese posílat do Kindlu",
  "In Amazon’s {link}, under Preferences and Personal Document Settings, add the address you’ll send from to the approved list.":
    "Na stránce Amazonu {link} v části Preferences a Personal Document Settings přidejte na seznam schválených adresu, ze které budete posílat.",
  "Your Kindle’s address": "Adresa vašeho Kindlu",
  "It’s listed on the same Amazon page.": "Najdete ji na stejné stránce Amazonu.",
  "Your mail": "Váš e-mail",
  "Send from": "Posílat z",
  "App password": "Heslo pro aplikaci",
  "Saved in the Keychain": "Uloženo v Klíčence",
  "Saved in the system vault": "Uloženo v systémovém trezoru",
  "Gmail, iCloud, Outlook and Yahoo want an app password, made in your account’s security settings.":
    "Gmail, iCloud, Outlook a Yahoo vyžadují heslo pro aplikaci, které vytvoříte v nastavení zabezpečení účtu.",
  Saved: "Uloženo",
  "Mail server": "Poštovní server",
  Port: "Port",
  "User name": "Uživatelské jméno",
  "Sends through {host}.": "Posílá se přes {host}.",
  "The mail server is filled in for common services.": "U běžných služeb se poštovní server vyplní sám.",
  "Change it": "Změnit",
  "Books you send": "Posílané knihy",
  "Send as": "Posílat jako",
  "EPUB looks best on Kindle. Other books are made into EPUB first.": "Na Kindlu vypadá nejlépe EPUB. Ostatní knihy se nejdřív převedou do EPUB.",
  "As is": "Beze změny",
  Checking: "Ověřování",
  "Save and check": "Uložit a ověřit",
  "Check connection": "Ověřit připojení",

  // Converting
  "All built in, with nothing to install. Shelfed reads EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, web pages and text, and makes EPUB, AZW3 for Kindle, PDF, Word, FB2, plain text and web pages.":
    "Vše je vestavěné, nic není třeba instalovat. Shelfed čte EPUB, MOBI, AZW3, FB2, komiksy, PDF, Word, Markdown, webové stránky a text a vytváří EPUB, AZW3 pro Kindle, PDF, Word, FB2, prostý text a webové stránky.",
  "PDF pages": "Stránky PDF",
  "Pages the size of a Paperwhite screen, for reading PDFs on a Kindle.": "Stránky velké jako displej Paperwhite, pro čtení PDF na Kindlu.",
  "{width} by {height} mm, for printing.": "{width} × {height} mm, pro tisk.",

  // About
  "Looking for a new version…": "Hledání nové verze…",
  "This is the latest version.": "Toto je nejnovější verze.",
  "Downloading {version}, {percent}%": "Stahování verze {version}, {percent} %",
  "Shelfed {version} is ready to go in.": "Shelfed {version} je připravený k instalaci.",
  "Shelfed {version} is out.": "Vyšel Shelfed {version}.",
  "Restart to update": "Restartovat a aktualizovat",
  Download: "Stáhnout",
  "Check for updates": "Zkontrolovat aktualizace",
  "Version {version}": "Verze {version}",
  "A quiet home for your books.": "Tichý domov pro vaše knihy.",
  "Keeping {n} book for you.|Keeping {n} books for you.": "Opatruje pro vás {n} knihu.|Opatruje pro vás {n} knihy.|Opatruje pro vás {n} knih.",
  Website: "Web",
  Source: "Zdrojový kód",
  Licence: "Licence",
  "Look for updates": "Hledat aktualizace",
  "Checks GitHub now and then for a new version.": "Čas od času zkontroluje na GitHubu, jestli nevyšla nová verze.",
  Log: "Protokol",
  "What Shelfed noted while running, for a bug report.": "Co si Shelfed za běhu zaznamenal, pro hlášení chyby.",
  "Made by {name}, built on Fragms Personal.": "Vytvořil {name}, postaveno na Fragms Personal.",

  // Colours (spines and ribbons, in Colours.tsx)
  "Any colour": "Jakákoli barva",
  "Slate blue": "Břidlicově modrá",
  Navy: "Námořnická modrá",
  Teal: "Petrolejová",
  Green: "Zelená",
  Tan: "Tabáková",
  Rust: "Rezavá",
  Oxblood: "Tmavě vínová",
  Indigo: "Indigová",
  Grey: "Šedá",
  Accent: "Barva zvýraznění",
  Crimson: "Karmínová",
  Gold: "Zlatá",
  Blue: "Modrá",
  Violet: "Fialová",
  Pink: "Růžová",
  Ivory: "Slonovinová",

  // The app password, said for the service the address belongs to.
  "Google’s app passwords": "heslech aplikací Google",
  "your Apple Account": "svém účtu Apple",
  "your Microsoft account": "svém účtu Microsoft",
  "Yahoo’s account security": "zabezpečení účtu Yahoo",
  "Not the password you sign in to Gmail with. Google wants an app password: turn on 2-Step Verification, then make one in {link} and paste its 16 letters here.":
    "Nezadávejte heslo, se kterým se přihlašujete do Gmailu. Google chce heslo pro aplikaci: zapněte dvoufázové ověření, pak si ho vytvořte v {link} a vložte sem jeho 16 písmen.",
  "Not the password you sign in to {service} with. Make an app password in {link} and paste it here.":
    "Nezadávejte heslo, se kterým se přihlašujete k účtu {service}. Vytvořte si heslo pro aplikaci v {link} a vložte ho sem.",
  "{n} book on it isn't in Shelfed yet.|{n} books on it aren't in Shelfed yet.":
    "{n} kniha v něm ještě není v Shelfedu.|{n} knihy v něm ještě nejsou v Shelfedu.|{n} knih v něm ještě není v Shelfedu.",
};

export default words;
